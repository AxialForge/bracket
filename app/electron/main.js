'use strict';
// The desktop shell for this app: the kit owns the window, IPC and the screenshot gate; this file
// says what is specific. Channels listed in `handlers` are desktop-only (they need Electron); the
// web shell must answer the same names (kit/test/contract.js checks).
const path = require('path');
const { createDesktopShell } = require('../../kit/electron/shell');
const { createService } = require('../main/service');
const app = require('../app.json');

createDesktopShell({
  app, createService, rootDir: path.join(__dirname, '..', '..'),
  window: { width: 1300, height: 860 },
  // The pages the release gate renders (`electron . --screenshots=<dir>`), in order.
  screenshots: [['dashboard', '#dashboard'], ['notes', '#notes'], ['jobs', '#jobs'], ['system', '#system'], ['settings', '#settings'], ['about', '#about']],
  updates: { enabled: () => true },
  handlers: () => new Map([
    // Add desktop-only channels here, e.g. ['files:reveal', (p) => shell.showItemInFolder(p)]; they must also appear in bridge-shape.js and in the web shell.
  ]),
});
