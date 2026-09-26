'use strict';
// The app's tests: the core / shell / bridge contract (kit/test/contract.js) plus the handlers.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createWebShell } = require('../../kit/server/shell');
const { checkContract } = require('../../kit/test/contract');
const { createService, CSV_SETS } = require('../main/service');
const meta = require('../app.json');

const rootDir = path.join(__dirname, '..', '..');
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bk-app-'));
const shell = createWebShell({ app: meta, createService, rootDir, dataDir, port: 0, roles: { GUEST: ['data:dashboard', 'data:series'], STANDARD: ['notes:list', 'notes:get', 'jobs:list'], SENSITIVE: ['notes:delete'] }, secrets: ['notify.email.pass', 'githubToken'], csvSets: CSV_SETS });

(async () => {
  const c = checkContract({ rootDir, webShell: shell, desktopMain: meta.shells.includes('desktop') ? 'app/electron/main.js' : null });
  const h = shell.svc.handlers;
  const n = h.get('notes:save')({ title: 'First', body: 'b', tag: 'Home' });
  assert.strictEqual(n.tag, 'home', 'tags are lower-cased');
  assert.throws(() => h.get('notes:save')({ title: '  ' }), /title/);
  assert.strictEqual(h.get('notes:list')().length, 1);
  assert.strictEqual(h.get('notes:seed')(), 12);
  const d = h.get('data:dashboard')();
  assert.strictEqual(d.notes.total, 13); assert.ok(d.notes.byTag.length >= 3); assert.ok(Array.isArray(d.perDay));
  assert.strictEqual(h.get('data:status')().notes_total, 13);
  assert.strictEqual(h.get('notes:delete')(n.id), 1);
  const rows = CSV_SETS.notes.rows(shell.svc.db, 0, Date.now() + 1);
  assert.strictEqual(rows.length, 12);
  assert.deepStrictEqual(h.get('data:series')('24h').points, [], 'no samples until the job runs');
  shell.svc.shutdown();
  console.log(`app tests passed (${c.core} core handlers, ${c.web} web handlers, ${c.events} events, ${c.desktopOnly} desktop channels)`);
})().catch(e => { console.error(e); process.exit(1); });
