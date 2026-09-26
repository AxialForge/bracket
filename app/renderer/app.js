'use strict';
/* The app's pages. UI (kit/renderer/ui.js) gives the helpers, the router and the shared pages;
   Dash (kit/renderer/dash.js) the dashboard; Cards the charts. One function per page in UI.views. */
const { $, $$, esc, tile, linkTile, makeTable, searchToolbar, toast, openModal, closeModal, fmtDate, fmtTime, fmtAgo, fmtN, store, RANGE_LABEL, isAdmin, views, pages, sections } = UI;
const api = window.api;

// ---------- glossary: this app's own terms (the kit ships the System and Security ones) ----------
// Mark a term anywhere with UI.term(key, text): hover shows `short`, a click opens the full entry.
Glossary.add({
  sample: { term: 'Sample', short: 'One value the background job records every 30 seconds.',
    long: 'The starter app records a sample so the dashboard has something to chart. A real app would measure something: a temperature, a queue length, a speed test.\n\nOld samples are deleted after the number of days set under Settings.',
    healthy: 'A new sample every 30 seconds.', fix: 'No new samples: the job stopped. Check the [[uptime|app uptime]] and the Log page.', related: ['uptime'] },
});

// ---------- dashboard: the catalog of cards this app offers ---------------------------------------
const dayLabel = (ms) => new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric' });
Dash.mount({
  title: 'Dashboard',
  header: ({ d }) => `<div class="livebar"><span class="dot ok"></span>${esc(d.greeting)} · ${d.notes.total} notes · sample ${d.last ? d.last.value : '—'} <span id="liveSample" class="muted"></span></div>`,
  load: async ({ range }) => { const [d, s] = await Promise.all([api.data.dashboard(), api.data.series(range)]); const cache = { [range]: s }; return { d, S: async (r) => cache[r] || (cache[r] = await api.data.series(r)) }; },
  catalog: [
    { type: 'notes', group: 'Status', label: 'Notes', help: 'How many notes exist and how many are open', sizes: ['s', 'm'], def: 's', guest: true, render: ({ d }) => linkTile('#notes', tile('', 'Notes', d.notes.total, `${d.notes.open} open · ${d.notes.today} added today`)) },
    { type: 'open', group: 'Status', label: 'Open notes', help: 'Notes not marked done, coloured by your thresholds', sizes: ['s', 'm'], def: 's', rule: { warn: 5, bad: 10 }, guest: true, render: ({ d, rule }) => linkTile('#notes', tile(Cards.colorFor(d.notes.open, rule), 'Open notes', d.notes.open, 'not yet done')) },
    { type: 'sample', group: 'Status', label: 'Latest sample', help: 'The value the background job recorded last', sizes: ['s', 'm'], def: 's', rule: { warn: 80, bad: 95 }, guest: true, render: ({ d, rule }) => tile(Cards.colorFor(d.last && d.last.value, rule), UI.term('sample', 'Latest sample'), d.last ? d.last.value : '—', d.last ? fmtAgo(d.last.ts) : 'no samples yet', 'tSample') },
    { type: 'chart_samples', group: 'Charts', label: 'Samples', help: 'The recorded value over the period', sizes: ['m', 'l', 'xl'], def: 'l', period: true, guest: true, render: async ({ S, range }) => { const s = await S(range); return Cards.series([{ name: 'Average', color: 'var(--accent)', points: s.points.map(p => ({ t: p.t, y: p.v })) }, { name: 'Peak', color: 'var(--warn)', points: s.points.map(p => ({ t: p.t, y: p.vmax })) }], `Samples (${RANGE_LABEL[range]})`, { fmt: v => Math.round(v), from: s.from, to: s.to, empty: 'No samples yet; the job records one every 30 seconds' }); } },
    { type: 'chart_notes', group: 'Charts', label: 'Notes per day', help: 'Notes created per day, last 30 days', sizes: ['m', 'l', 'xl'], def: 'l', guest: true, render: ({ d }) => Cards.columns(d.perDay.map(p => ({ x: dayLabel(p.day), values: [p.n] })), 'Notes per day (30 days)', { sets: [{ name: 'Notes', color: 'var(--accent2)' }], empty: 'No notes yet' }) },
    { type: 'tags', group: 'Charts', label: 'Notes by tag', help: 'Share of notes per tag', sizes: ['m', 'l', 'xl'], def: 'l', guest: true, render: ({ d }) => Cards.bars(d.notes.byTag.map(t => ({ k: t.k, n: t.n })), 'Notes by tag', { drill: false }) },
    { type: 'recent', group: 'Lists', label: 'Recent notes', help: 'The newest notes', sizes: ['l', 'xl'], def: 'l', list: true, render: ({ d, o }) => `<div class="card"><h3>Recent notes <a class="right" href="#notes">all →</a></h3><table>${d.recent.slice(0, o.limit || 8).map(n => `<tr><td class="muted nowrap">${fmtAgo(n.updated)}</td><td class="wrap"><a href="#notes/${n.id}">${esc(n.title)}</a>${n.tag ? ` <span class="badge">${esc(n.tag)}</span>` : ''}${n.done ? ' <span class="badge ok">done</span>' : ''}</td></tr>`).join('') || '<tr><td class="muted">No notes yet.</td></tr>'}</table></div>` },
    { type: 'jobs', group: 'Lists', label: 'Jobs', help: 'Background jobs and when they last ran', sizes: ['l', 'xl'], def: 'l', render: ({ d }) => `<div class="card"><h3>Jobs</h3><table>${d.jobs.map(j => `<tr><td>${esc(j.name)}</td><td class="muted">${j.last_run ? fmtAgo(j.last_run) : 'never'}</td><td class="${j.last_error ? 'bad' : 'ok'}">${esc(j.last_error || 'ok')}</td></tr>`).join('') || '<tr><td class="muted">No daily job has run yet.</td></tr>'}</table></div>` },
  ],
  defaults: ['notes', 'open', 'sample', { type: 'chart_samples', size: 'l' }, { type: 'chart_notes', size: 'l' }, 'recent', 'tags'],
});
views.dashboard = Dash.render;
api.data.onTick(t => { const n = $('#tSample .value'); if (n) n.textContent = t.value; const l = $('#liveSample'); if (l) l.textContent = `· live ${t.value}`; });
api.notes.onChanged(() => { if (UI.current() === 'notes' || UI.current() === 'dashboard') UI.route(); });

// ---------- notes: a table with add / edit / delete --------------------------------------------
views.notes = async (id) => {
  const v = UI.view();
  const list = await api.notes.list();
  const filter = store.get('notesFilter', 'all');
  const rows = filter === 'open' ? list.filter(n => !n.done) : filter === 'done' ? list.filter(n => n.done) : list;
  v.innerHTML = `<h1>Notes</h1>
    <p class="lead">A plain table with the kit's sort, filter and row-click helpers. Admins add and edit; standard users read; guests never see this page.</p>
    <div class="toolbar">${[['all', 'All'], ['open', 'Open'], ['done', 'Done']].map(([k, l]) => `<button class="small ${k === filter ? 'primary' : ''} nf" data-f="${k}">${l}</button>`).join('')}<span class="grow"></span>${isAdmin() ? '<button class="small" id="nSeed">Add sample notes</button><button class="primary" id="nNew">New note</button>' : ''}</div>
    <div id="nTable"></div>`;
  const cols = [
    { key: 'done', label: '', render: n => `<span class="dot ${n.done ? 'ok' : ''}"></span>`, sortVal: n => n.done },
    { key: 'title', label: 'Title', cls: 'wrap', render: n => `<b>${esc(n.title)}</b>${n.body ? `<span class="sub">${esc(n.body.slice(0, 80))}</span>` : ''}` },
    { key: 'tag', label: 'Tag', render: n => n.tag ? `<span class="badge">${esc(n.tag)}</span>` : '' },
    { key: 'created', label: 'Created', render: n => fmtDate(n.created), sortVal: n => n.created },
    { key: 'updated', label: 'Updated', render: n => fmtAgo(n.updated), sortVal: n => n.updated },
  ];
  const t = makeTable(rows, cols, { defaultSort: { key: 'updated', asc: false }, search: n => `${n.title} ${n.body || ''} ${n.tag || ''}`, onRow: n => noteModal(n.id) });
  $('#nTable').append(searchToolbar(t, rows.length), t.node);
  $$('.nf').forEach(b => { b.onclick = () => { store.set('notesFilter', b.dataset.f); views.notes(); }; });
  if ($('#nNew')) $('#nNew').onclick = () => noteModal(null);
  if ($('#nSeed')) $('#nSeed').onclick = async () => { const n = await api.notes.seed(); toast(`${n} sample notes added`); };
  if (id) noteModal(Number(id));
};
async function noteModal(id) {
  const n = id ? await api.notes.get(id) : { title: '', body: '', tag: '', done: 0 };
  if (!n) return toast('No such note', true);
  const ro = !isAdmin();
  const card = openModal(`<h2>${id ? 'Edit note' : 'New note'}</h2>${id ? `<div class="path">created ${fmtDate(n.created)} · updated ${fmtDate(n.updated)}</div>` : ''}
    <div class="field"><label>Title</label><input type="text" id="nmTitle" value="${esc(n.title)}" ${ro ? 'disabled' : ''}></div>
    <div class="field"><label>Tag</label><input type="text" id="nmTag" value="${esc(n.tag || '')}" placeholder="home, work, idea…" ${ro ? 'disabled' : ''}></div>
    <div class="field"><label>Body</label><textarea id="nmBody" rows="5" ${ro ? 'disabled' : ''}>${esc(n.body || '')}</textarea></div>
    <div class="field"><label>Done</label><input type="checkbox" id="nmDone" ${n.done ? 'checked' : ''} ${ro ? 'disabled' : ''}></div>
    <div class="actions">${id && !ro ? '<button class="danger" id="nmDelete">Delete</button>' : ''}<span class="grow"></span><button id="nmClose">Close</button>${ro ? '' : '<button class="primary" id="nmSave">Save</button>'}</div>`);
  $('#nmClose', card).onclick = closeModal;
  if ($('#nmSave', card)) $('#nmSave', card).onclick = async () => { try { await api.notes.save({ id, title: $('#nmTitle', card).value, tag: $('#nmTag', card).value, body: $('#nmBody', card).value, done: $('#nmDone', card).checked }); closeModal(); toast('Saved'); } catch (e) { toast(e.message, true); } };
  if ($('#nmDelete', card)) $('#nmDelete', card).onclick = async () => { if (!confirm('Delete this note?')) return; try { await api.notes.delete(id); closeModal(); toast('Deleted'); } catch (e) { toast(e.message, true); } };
}

// ---------- jobs -------------------------------------------------------------------------------------
views.jobs = async () => {
  const v = UI.view();
  const jobs = await api.jobs.list();
  v.innerHTML = `<h1>Jobs</h1><p class="lead">Every named job the core has run, with its last result. Interval jobs (the sample every 30 s) are not listed here; daily jobs are.</p>
    <div class="card"><table class="jobs"><thead><tr><th>Job</th><th>Last run</th><th>Last success</th><th>Detail</th></tr></thead><tbody>${jobs.map(j => `<tr><td>${esc(j.name)}</td><td>${j.last_run ? fmtTime(j.last_run) : 'never'}</td><td>${j.last_ok ? fmtTime(j.last_ok) : '—'}</td><td class="${j.last_error ? 'bad' : 'muted'}">${esc(j.last_error || (j.detail ? JSON.stringify(j.detail) : ''))}</td></tr>`).join('') || '<tr><td colspan="4" class="muted">Nothing has run yet.</td></tr>'}</tbody></table>
    ${isAdmin() ? '<div class="inline" style="margin-top:10px"><button id="jbBackup">Back up the database now</button></div>' : ''}</div>`;
  if ($('#jbBackup')) $('#jbBackup').onclick = async () => { try { const p = await api.jobs.backupNow(); toast('Backup written: ' + p); views.jobs(); } catch (e) { toast(e.message, true); } };
};

// ---------- settings ----------------------------------------------------------------------------------
views.settings = async () => {
  const v = UI.view();
  const s = await api.settings.get();
  const notif = sections.notifications(s, { noteDone: 'A note is marked done', dailySummary: 'A summary every morning' });
  const ha = sections.homeAssistant('Read-only status JSON (note counts and the latest sample) for REST sensors:');
  const look = sections.appearance();
  v.innerHTML = `<h1>Settings</h1><div class="form">
    <div class="section-head"><h2>General</h2></div>
    <div class="card">
      <div class="field"><label>Greeting</label><input type="text" id="gGreet" value="${esc(s.general.greeting)}"></div>
      <div class="field"><label>Record a sample every</label><div class="inline"><input type="number" id="gEvery" min="5" max="3600" value="${s.general.sampleEverySeconds}" style="width:90px"> seconds · keep <input type="number" id="gKeep" min="1" max="3650" value="${s.general.keepSamplesDays}" style="width:80px"> days</div></div>
      <div class="field"><label>Nightly backup at</label><input type="time" id="gBackup" value="${esc(s.backup.time)}" style="width:120px"><div class="hint">A VACUUM INTO copy next to the database; the newest 10 are kept.</div></div>
      <div class="inline"><button class="primary" id="gSave">Save</button></div>
    </div>
    ${notif.html}${ha.html}${look.html}</div>`;
  const save = async (patch, msg = 'Saved') => { try { await api.settings.set(patch); toast(msg); } catch (e) { toast(e.message, true); } };
  $('#gSave').onclick = () => save({ general: { greeting: $('#gGreet').value, sampleEverySeconds: Number($('#gEvery').value) || 30, keepSamplesDays: Number($('#gKeep').value) || 30 }, backup: { time: $('#gBackup').value } });
  notif.wire(save); ha.wire(); look.wire();
};

// ---------- kit pages --------------------------------------------------------------------------------
views.system = pages.system;
views.log = pages.log;
views.security = pages.security;
views.about = pages.about({ blurb: 'The starter app that every Bracket project begins as: a notes table, a background job, a dashboard with an editable card grid, settings, notifications, a Home Assistant status URL, and the shared security model, on both the desktop and the web shell.', credits: [] });

// ---------- boot --------------------------------------------------------------------------------------
UI.init({
  home: 'dashboard',
  nav: [
    { group: 'App', items: [
      { view: 'dashboard', label: 'Dashboard', icon: '◧', roles: ['admin', 'standard', 'guest'] },
      { view: 'notes', label: 'Notes', icon: '▤', pill: 'notesPill' },
      { view: 'jobs', label: 'Jobs', icon: '⟳' },
    ] },
    { group: 'System', items: [
      { view: 'system', label: 'System', icon: '♥', pill: 'sysPill' },
      { view: 'log', label: 'Log', icon: '≣', roles: ['admin'] },
      { view: 'security', label: 'Security', icon: '⛨', pill: 'secPill', pillClass: 'bad' },
      { view: 'settings', label: 'Settings', icon: '⚙', roles: ['admin'] },
      { view: 'about', label: 'About', icon: 'ⓘ', pill: 'updatePill', pillClass: 'accent', roles: ['admin', 'standard', 'guest'] },
    ] },
  ],
  standardRoleText: 'the dashboard and notes read-only, their own password and dashboard layout.',
  logHint: 'on the Pi also: journalctl -u bracket -f',
  onReady: async () => { try { if (!UI.isGuest()) { const list = await api.notes.list({ open: true }); UI.setPill('notesPill', list.length); } } catch { /* ignore */ } },
});
// Re-draw the dashboard every two minutes so charts move without a reload (not while it is being edited).
setInterval(() => { if (UI.current() === 'dashboard' && document.visibilityState === 'visible' && !Dash.editing()) UI.route(); }, 120000);
