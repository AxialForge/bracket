# Setup checklist for the Bracket template itself

This file is for the template repository. An app made from it gets its own `SETUP.md` from
`tools/new-app.js`.

- [x] Git identity: `git config --local --get-regexp "^user\."` prints nothing.
- [x] `npm test` passes; `npm run dev` serves the starter app; `npm run screenshots` passes.
- [ ] Mark the repository as a template on GitHub (Settings → Template repository).
- [ ] Move MediaLedger and Linewatch onto the kit once their next releases are out.
