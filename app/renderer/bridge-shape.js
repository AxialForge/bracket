// The one description of the `window.api` object the renderer uses.
//
// Leaves are channel names. A leaf starting with "!" is an event stream the UI subscribes to;
// everything else is a request. kit/renderer/webbridge.js turns it into fetch + EventSource and
// kit/electron/preload.js into IPC. kit/test/contract.js checks that every request channel here is
// served by the core or a shell, and that nothing is served without being listed here.
(function (root, shape) {
  if (typeof module !== 'undefined' && module.exports) module.exports = shape;
  else root.API_SHAPE = shape;
})(typeof self !== 'undefined' ? self : this, {
  // kit
  appInfo: 'app:info',
  settings: { get: 'settings:get', set: 'settings:set', replace: 'settings:replace' },
  update: { check: 'update:check', status: 'update:status', install: 'update:install' },
  sys: { stats: 'sys:stats' },
  db: { stats: 'db:stats' },
  logTail: 'log:tail',
  notifyTest: 'notify:test',
  prefs: { get: 'prefs:get', set: 'prefs:set' },
  security: { me: 'security:me', status: 'security:status', changePassword: 'security:changePassword', totpSetup: 'security:totpSetup', totpEnable: 'security:totpEnable', totpDisable: 'security:totpDisable', setOptions: 'security:setOptions', revoke: 'security:revoke', revokeOthers: 'security:revokeOthers', users: 'security:users', addUser: 'security:addUser', setRole: 'security:setRole', resetPassword: 'security:resetPassword', deleteUser: 'security:deleteUser', tlsEnable: 'security:tlsEnable' },
  status: { info: 'status:info', rotate: 'status:rotate' },
  dialog: { pickFolder: 'dialog:pickFolder', pickFile: 'dialog:pickFile' },
  shell: { open: 'shell:open', openExternal: 'shell:openExternal', showItem: 'shell:showItem' },
  // app
  data: { dashboard: 'data:dashboard', series: 'data:series', status: 'data:status', onTick: '!tick' },
  notes: { list: 'notes:list', get: 'notes:get', save: 'notes:save', delete: 'notes:delete', seed: 'notes:seed', onChanged: '!notes:changed' },
  jobs: { list: 'jobs:list', backupNow: 'jobs:backupNow' },
});
