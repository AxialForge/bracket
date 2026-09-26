#!/usr/bin/env node
'use strict';
// The web shell for this app: the kit does the serving, this file says what is specific.
//
//   node app/server/server.js [--data=<dir>] [--port=8090] [--host=0.0.0.0]
//   node app/server/server.js --set-password        (create/reset the "admin" account; reads BRACKET_PASSWORD or prompts)
const path = require('path');
const { createWebShell, resolveOptions } = require('../../kit/server/shell');
const { createService, CSV_SETS } = require('../main/service');
const app = require('../app.json');

const opts = resolveOptions({ app, defaultPort: app.port });
const shell = createWebShell({
  app, createService, rootDir: path.join(__dirname, '..', '..'),
  dataDir: opts.dataDir, port: opts.port, host: opts.host,
  // What each role may call. Admins get everything; kit channels (settings, security, prefs…) are already placed.
  roles: {
    GUEST: ['data:dashboard', 'data:series'],
    STANDARD: ['notes:list', 'notes:get', 'jobs:list'],
    SENSITIVE: ['notes:delete'],
  },
  // Dotted settings paths that are blanked for every browser and mapped back on save.
  secrets: ['notify.email.pass', 'githubToken'],
  // Web-only handlers and overrides. They receive { session, ip, role, req } first.
  webHandlers: ({ svc }) => new Map([
    // Guests see the dashboard without the note titles.
    ['data:dashboard', (ctx) => { const d = svc.handlers.get('data:dashboard')(); return ctx.role !== 'guest' ? d : { ...d, recent: [] }; }],
  ]),
  csvSets: CSV_SETS,
  statusChannel: 'data:status',
});

if (opts.setPassword) shell.setPasswordCli(); else shell.start();
