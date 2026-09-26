# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

The kit's version is `kit/VERSION`; it moves with the package version whenever anything under
`kit/` changes, so an app can tell at a glance which kit it carries.

## [Unreleased]

## [0.2.0] - 2026-09-25

### Added

- **Glossary** (`kit/renderer/glossary.js`, kit 0.2.0). `Glossary.add({ key: { term, short, long,
  healthy, fix, related } })` plus `UI.term(key, text)` marks a word on any page. A dotted underline
  shows it is explained; hovering shows a one-line definition, and clicking opens a side panel
  with the full explanation, what healthy looks like, what to do when it isn't, and related terms.
  The kit ships entries for its own System and Security pages, and those pages now mark their
  terms. An app's entry replaces the kit's. Unknown keys and apps without `glossary.js` get plain
  text, so nothing breaks.
- The starter app adds one term of its own (the sample) as the example.
- `kit/test/glossary.test.js`: markup, escaping, links and that every kit entry's links resolve.

## [0.1.0] - 2026-09-25

### Added

- The kit, extracted from MediaLedger 1.12 and Linewatch 0.2: core skeleton (`node:sqlite` store
  with migrations and backups, settings, jobs, notifications, system monitor, CSV, zip), web shell
  (accounts, roles, sessions, lockout, LAN-only, two-factor codes, re-authentication, audit log,
  secret redaction, SSE, CSV downloads, Home Assistant status URL, reverse-proxy awareness),
  desktop shell (window, IPC, screenshot release gate, preload builder, silent updater), renderer
  (eight themes, tables, tiles, cards, the editable dashboard, shared Security / System / Log /
  About pages and settings sections).
- The starter app: notes with tags, a sampling job, retention and backup jobs, CSV sets, a card
  catalog, and the contract test that keeps `bridge-shape.js` and the handlers in step.
- `tools/new-app.js` (rename in place, web-only or desktop-only), `tools/kit-upgrade.js` (diff and
  replace `kit/` from GitHub or a local checkout), `tools/make-icon.js` (dependency-free icons).
- A FastAPI adapter (`kit/python/bracket_fastapi.py`) that serves the same renderer and contract.
- The Pi installer with the app's name in its banner, the Caddy site block, CI that tests, packs the
  server and builds the Windows installer on a tag.
