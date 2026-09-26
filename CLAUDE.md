# Bracket — project guide for Claude Code

Bracket is the template and vendored kit behind AxialForge's self-hosted apps. It is the common
half of MediaLedger and Linewatch pulled out into one place: a core skeleton on `node:sqlite`, a web
shell for a Raspberry Pi behind Caddy, an Electron desktop shell, the renderer (themes, tables,
cards, the editable dashboard, the shared Security / System / Log / About pages), the Pi installer,
CI, and the tools that turn a checkout into a new app. It is not a framework you install: apps
vendor `kit/` and replace it whole when a newer kit is out.

## Non-negotiables (don't regress these)

- **Zero runtime dependencies for the core and the web shell.** `node:sqlite`, `node:http`,
  `node:crypto`, `child_process`. No native addons (Node 24 + ClangCL cannot build them on the
  Windows box), no CDN assets, no build step for the renderer.
- **`kit/` must stay app-agnostic.** Nothing in it may know an app's name, tables, channels or
  pages; identity comes from `app/app.json` and the renderer's `window.APP`. If a change needs an
  app-specific branch, it belongs in the app or behind an option.
- **The two shells stay equivalent.** Every channel the renderer can call is answered by the web
  shell and the desktop shell (desktop-only ones get a web stub in `kit/server/shell.js`,
  `WEB_CHANNELS`); `kit/test/contract.js` fails when that drifts.
- **Security defaults do not loosen**: LAN-only on, guest off, admin re-authentication for
  SENSITIVE channels, secrets redacted on the way out and mapped back on the way in, cookie named
  `<slug>_session` so two apps on one host do not share sessions.
- **The starter app is a demonstration, not a product.** Keep it small enough to read in one
  sitting; every extension point should appear exactly once in it.
- Global rules from `~/.claude/CLAUDE.md`: AxialForge identity, no Claude attribution, imperative
  commit messages, version bump and CHANGELOG in one commit, tag → CI builds. No paid services.
  Bump `kit/VERSION` with the package version whenever `kit/` changes.

## Commands

```bash
npm test                          # kit tests + the starter app's contract and handler tests (plain node)
npm run dev                       # the starter app on http://localhost:8090, data in ./.devdata
node app/server/server.js --data=.devdata --set-password
npm install && npm start          # desktop shell (Electron)
npm run screenshots               # renders every page headless, exits 3 on a renderer error
npm run icons                     # regenerate every icon from tools/make-icon.js
npm run pack:server               # dist/bracket-server.tar.gz + .sha256
node tools/new-app.js --name "X" --slug x --port 8083 [--web-only|--desktop-only]
node tools/kit-upgrade.js [--from ../Bracket] [--apply]
bash -n server/install.sh
```

## Architecture

```
kit/main/core.js        createCore({ app, dataDir, log, send, defaults, schema, migrations, counts, disks, busy })
                        → { settings, db, notifier, handlers, h, daily, every, minute, onSettings, start, shutdown, restart, notify }
kit/server/shell.js     createWebShell({ app, createService, rootDir, dataDir, port, host, roles, secrets, webHandlers, routes, csvSets, statusChannel })
                        → node:http server: sessions, roles, re-auth, redaction, SSE, /csv, /exports, /api/status, static files
kit/electron/shell.js   createDesktopShell({ app, createService, rootDir, window, screenshots, handlers, updates }) → Electron window + IPC
kit/renderer/ui.js      window.UI: $, esc, tile, makeTable, searchToolbar, toast, modals, router, nav, pills, pages.*, sections.*
kit/renderer/dash.js    window.Dash: mount({ catalog, defaults, load, guest, prefKey }), render, editing()
kit/renderer/cards.js   window.Cards: number, bars, donut, trend, series, columns, colorFor, configure
kit/renderer/webbridge.js  builds window.api from window.API_SHAPE for the web; kit/electron/preload.js does the same over IPC
app/                    the starter app: app.json, main/service.js, server/server.js, electron/main.js, renderer/*
```

### Directory map

| Path | Owns |
|---|---|
| `kit/main/` | `db.js` (Db: schema, migrations with backup, kv, jobs), `settings.js`, `csv.js`, `notify.js` (webhook + SMTP), `sysmon.js`, `zip.js`, `core.js` |
| `kit/server/` | `security.js` (users, sessions, lockout, TOTP, prefs, audit), `totp.js`, `shell.js` (the HTTP server) |
| `kit/electron/` | `shell.js`, `preload.js` (`expose(shape, name)`), `updater.js` |
| `kit/renderer/` | `kit.css` (tokens, eight themes, all layout), `ui.js`, `cards.js`, `dash.js`, `webbridge.js`, `theme.js`, `qr.js` |
| `kit/python/` | `bracket_fastapi.py`: the same contract and kit channels for a FastAPI backend |
| `kit/ops/` | `pack-server.js` (release tarball + sha256), `caddy-site.txt` |
| `kit/test/` | `contract.js` (bridge ⇄ handlers ⇄ events), `kit.test.js` |
| `app/` | the starter app; `app/test/app.test.js` runs the contract for it |
| `server/install.sh` | Pi installer with `__NAME__`/`__SLUG__`/`__PORT__`/`__GITHUB__` placeholders that `new-app.js` fills |
| `tools/` | `new-app.js`, `kit-upgrade.js`, `make-icon.js` |
| `docs/` | `GUIDE.md` (every extension point), `RASPBERRY-PI.md` (templated for the app) |

### The request path

`app.js` calls `window.api.notes.save(...)`; `bridge-shape.js` names that channel `notes:save`;
`webbridge.js` POSTs `/api/notes:save` (or `preload.js` sends it over IPC); the shell checks the
session, the role list and, for SENSITIVE channels, the re-authentication window; then
`core.handlers.get('notes:save')(...args)`. Events go the other way: `core.send('notes:changed')`
→ SSE or `webContents.send` → `api.notes.onChanged(fn)`. Leaves starting with `!` in the shape are
events.

### Roles

Admins may call everything. `roles.STANDARD` is what a standard account may call beyond the kit's
own (settings read, system stats, own password and preferences); `roles.GUEST` is what a page
without an account may call when guest access is on; `roles.SENSITIVE` asks for the password again.
Guest-safe data is a `webHandlers` override that strips what guests should not see.

## The core extension point

`createCore` returns the handlers Map plus `h(channel, fn)`, `every(name, msFn, fn)`,
`daily(name, hhmmFn, fn)`, `onSettings(fn)`, `notify(event, title, text, extra)`. An app's
`createService({ dataDir, log, send })` builds a core, adds tables through `schema` and
`migrations`, registers handlers and jobs, and returns `{ ...core, CSV_SETS }`. Both shells call it
the same way; nothing in it may require Electron or `http`.

## Gotchas / constraints

- **Scripts that load after `app.js` (dash.js, cards.js) may not exist when the first route runs.**
  Symptom: "Cannot read properties of undefined (reading 'render')" on a cold load, only
  sometimes. `UI.init` waits for `DOMContentLoaded` before the first route; do not bypass it by
  routing from the top of `app.js`.
- **`node:sqlite` binds every JavaScript number as REAL.** `(ts / ?) * ?` for time buckets yields
  fractional keys that never match. Use `CAST(ts / ? AS INTEGER) * ?` and floor on the JS side too.
- **Cookies ignore the port.** Two apps on one host with the same cookie name sign each other out.
  The kit names it `<slug>_session`; `new-app.js` sets the slug, so never hard-code `bracket_session`.
- **Behind Caddy every request arrives from 127.0.0.1.** `X-Forwarded-For` / `X-Forwarded-Proto`
  are trusted only when the socket is loopback; LAN-only, lockout and the audit log use the
  forwarded address. The app's own TLS switch refuses to turn on when proxied (Caddy owns TLS).
- **Two apps' `install.sh` are indistinguishable by name.** Docs download it as `<slug>-install.sh`
  and the installer prints its app banner first; a Linewatch install once rewrote MediaLedger's
  fstab line. The installer only touches `/etc/fstab` after the mount is proven.
- **`contextBridge.exposeInMainWorld('api', …)` makes a non-configurable global.** Symptom: the
  desktop shell alone fails with "Identifier 'api' has already been declared (app.js:1)" while the
  web shell is fine. A top-level `const api = window.api` is a SyntaxError against such a global,
  so the preload exposes `window.__api` and `webbridge.js` republishes it as a plain `window.api`.
  Never expose the bridge directly under the name pages declare.
- **Electron's `--profile=` must be absolute.** `app.setPath('userData', '.devdata-desktop')`
  throws "Path must be absolute"; the shell resolves it against the working directory.
- **`ALTER TABLE ... ADD COLUMN` in a migration must tolerate "duplicate column"** (a migration
  that half-applied before a crash). `Db.migrate` swallows exactly that error, nothing else.
- **Electron and `electron-updater` are the only dependencies and only for the desktop shell.**
  `npm install` is not needed for tests or the web shell; CI's test job runs without it.
- **`x_*` UniFi-style secret fields never reach storage.** Apps that snapshot third-party config
  strip volatile and secret keys before hashing (see Linewatch's `VOLATILE`); the kit's redaction
  covers only the settings tree.

## Roadmap (unbuilt)

- Move MediaLedger and Linewatch onto the kit (their renderers already match `ui.js`).
- A Python starter app next to the JS one, built on the FastAPI adapter.
- Desktop "connect to server" mode (the desktop shell talking to a Pi's web shell over the bridge).

## Release

Bump `package.json` (and `kit/VERSION` when `kit/` changed) and add a `CHANGELOG.md` entry in one
commit, then `git tag vX.Y.Z && git push origin main --tags`. CI runs the tests, packs the server,
builds the Windows installer and attaches everything to the GitHub Release.
