'use strict';
// The app's core: everything it does that is not "be a window" or "be a web server". Both shells
// host this. Nothing in here may require Electron or HTTP.
//
// This starter keeps a list of notes and records one sample every 30 seconds, which is enough to
// show every kit feature: a table with CRUD, a live event stream, a background job, a daily job,
// dashboard data, a Home Assistant status object, CSV sets and roles. Replace `notes` with the
// real thing and keep the shape.
const { createCore } = require('../../kit/main/core');
const { iso, dayStart } = require('../../kit/main/csv');
const meta = require('../app.json');

const DAY = 86400000, HOUR = 3600000;
const SCHEMA = `
CREATE TABLE IF NOT EXISTS notes (
  id       INTEGER PRIMARY KEY,
  created  INTEGER NOT NULL,
  updated  INTEGER NOT NULL,
  title    TEXT NOT NULL,
  body     TEXT,
  tag      TEXT,
  done     INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS samples (
  ts     INTEGER PRIMARY KEY,
  value  REAL
);
`;
// Append-only: never edit an old entry, add a new { version, name, sql }.
const MIGRATIONS = [];

// Everything the app remembers, deep-merged over the kit's own defaults (ui.prefs, notify, githubToken).
const DEFAULTS = {
  general: { greeting: 'Hello', sampleEverySeconds: 30, keepSamplesDays: 30 },
  backup: { time: '03:30' },
  notify: { events: { noteDone: true, dailySummary: false } },
};

// CSV sets: the nightly / download data sets (kit/server/shell.js serves them at /csv/<set>).
const CSV_SETS = {
  notes: { label: 'Notes', rows: (db, a, b) => db.all('SELECT * FROM notes WHERE created >= ? AND created < ? ORDER BY created', a, b), cols: [['created', r => iso(r.created)], ['updated', r => iso(r.updated)], ['title', r => r.title], ['tag', r => r.tag], ['done', r => r.done], ['body', r => r.body]] },
  samples: { label: 'Samples', rows: (db, a, b) => db.all('SELECT * FROM samples WHERE ts >= ? AND ts < ? ORDER BY ts', a, b), cols: [['time', r => iso(r.ts)], ['value', r => r.value]] },
};

const RANGES = { '6h': [6 * HOUR, 60000], '24h': [DAY, 300000], '7d': [7 * DAY, 30 * 60000], '30d': [30 * DAY, 2 * HOUR], '1y': [365 * DAY, DAY] };

function createService({ dataDir, log = () => {}, send = () => {} }) {
  const core = createCore({ app: meta, dataDir, log, send, defaults: DEFAULTS, schema: SCHEMA, migrations: MIGRATIONS, counts: ['notes', 'samples'] });
  const { db, settings, notify, h } = core;

  // ---- jobs ------------------------------------------------------------------------------------
  core.every('sample', () => (Number(settings.get().general.sampleEverySeconds) || 30) * 1000, () => {
    const value = Math.round((50 + 40 * Math.sin(Date.now() / 3600000) + Math.random() * 10) * 10) / 10;
    db.run('INSERT OR REPLACE INTO samples(ts, value) VALUES(?, ?)', Date.now(), value);
    send('tick', { ts: Date.now(), value });
  });
  core.every('retention', HOUR, () => { const days = Number(settings.get().general.keepSamplesDays) || 30; db.run('DELETE FROM samples WHERE ts < ?', Date.now() - days * DAY); });
  core.daily('backup', () => settings.get().backup.time, () => { const dest = db.backup('nightly'); log('backup: ' + dest); });
  core.daily('summary', () => settings.get().notify.dailyTime, (now) => {
    if (!settings.get().notify.events.dailySummary) return;
    const n = db.get('SELECT COUNT(*) n FROM notes WHERE created >= ?', dayStart(now) - DAY).n;
    notify('dailySummary', `${meta.name} summary`, `${n} note(s) added yesterday.`);
  });
  core.onSettings((before, after) => { if (before.general.sampleEverySeconds !== after.general.sampleEverySeconds) core.restart('sample'); });

  // ---- data ------------------------------------------------------------------------------------
  function series(range = '24h', now = Date.now()) {
    const [span, bucket] = RANGES[range] || RANGES['24h'];
    // CAST: node:sqlite binds numbers as REAL, so a plain division would not land on the bucket grid.
    return { range, from: now - span, to: now, bucket, points: db.all('SELECT CAST(ts / ? AS INTEGER) * ? AS t, AVG(value) v, MAX(value) vmax FROM samples WHERE ts >= ? GROUP BY t ORDER BY t', bucket, bucket, now - span) };
  }
  function dashboard() {
    const now = Date.now();
    return {
      now, greeting: settings.get().general.greeting,
      notes: { total: db.get('SELECT COUNT(*) n FROM notes').n, open: db.get('SELECT COUNT(*) n FROM notes WHERE done=0').n, today: db.get('SELECT COUNT(*) n FROM notes WHERE created >= ?', dayStart(now)).n, byTag: db.all("SELECT COALESCE(tag, 'untagged') k, COUNT(*) n FROM notes GROUP BY k ORDER BY n DESC") },
      recent: db.all('SELECT id, title, tag, done, updated FROM notes ORDER BY updated DESC LIMIT 8'),
      last: db.get('SELECT * FROM samples ORDER BY ts DESC LIMIT 1') || null,
      perDay: db.all('SELECT CAST(created / ? AS INTEGER) * ? AS day, COUNT(*) n FROM notes WHERE created >= ? GROUP BY day ORDER BY day', DAY, DAY, dayStart(now) - 29 * DAY),
      jobs: db.jobs(),
    };
  }

  // ---- handlers --------------------------------------------------------------------------------
  h('data:dashboard', () => dashboard());
  h('data:series', (range) => series(range));
  // The Home Assistant status object (GET /api/status?key=…): flat, stable keys.
  h('data:status', () => { const d = dashboard(); return { app: meta.name, notes_total: d.notes.total, notes_open: d.notes.open, notes_today: d.notes.today, sample: d.last ? d.last.value : null, sample_at: d.last ? new Date(d.last.ts).toISOString() : null }; });
  h('notes:list', (opts = {}) => db.all(`SELECT * FROM notes ${opts.open ? 'WHERE done=0' : ''} ORDER BY updated DESC LIMIT 2000`));
  h('notes:get', (id) => db.get('SELECT * FROM notes WHERE id=?', Number(id)) || null);
  h('notes:save', (n = {}) => {
    const title = String(n.title || '').trim(); if (!title) throw new Error('A note needs a title');
    const now = Date.now(); const tag = String(n.tag || '').trim().toLowerCase() || null;
    let id = Number(n.id) || null;
    if (id) db.run('UPDATE notes SET title=?, body=?, tag=?, done=?, updated=? WHERE id=?', title, String(n.body || ''), tag, n.done ? 1 : 0, now, id);
    else id = Number(db.run('INSERT INTO notes(created, updated, title, body, tag, done) VALUES(?,?,?,?,?,?)', now, now, title, String(n.body || ''), tag, n.done ? 1 : 0).lastInsertRowid);
    send('notes:changed', { id });
    if (n.done) notify('noteDone', `Done: ${title}`, String(n.body || '').slice(0, 200), { id });
    return db.get('SELECT * FROM notes WHERE id=?', id);
  });
  h('notes:delete', (id) => { const r = db.run('DELETE FROM notes WHERE id=?', Number(id)).changes; send('notes:changed', { id: Number(id), deleted: true }); return r; });
  h('notes:seed', () => { const tags = ['home', 'work', 'idea']; let n = 0; db.transaction(() => { for (let i = 0; i < 12; i++) { const t = Date.now() - Math.floor(Math.random() * 20) * DAY; db.run('INSERT INTO notes(created, updated, title, body, tag, done) VALUES(?,?,?,?,?,?)', t, t, `Sample note ${i + 1}`, 'Generated by notes:seed so the pages have something to show.', tags[i % 3], i % 4 === 0 ? 1 : 0); n++; } }); send('notes:changed', {}); return n; });
  h('jobs:list', () => db.jobs());
  h('jobs:backupNow', () => db.backup('manual'));

  return { ...core, series, dashboard, CSV_SETS };
}

module.exports = { createService, CSV_SETS, RANGES };
