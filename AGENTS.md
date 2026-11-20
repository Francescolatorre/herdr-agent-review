# Development instructions

Build a native herdr-app review mod, not a legacy Herdr TUI plugin or a web app.
Read README.md and HANDOFF.md first. Do not add direct agent sending without an
explicit user request; the initial scope ends at feedback preview and copy.

- `mods/agent-review/review.js`: pure data logic, testable with Node.
- `mods/agent-review/main.js`: GPUI JavaScript UI and Herdr adapter.
- Run `node --check mods/agent-review/main.js` and `npm test` after changes.
- If herdr-app is available, run `herdr-app check ./mods/agent-review`.
- A passing check is not visual or interaction validation. Report missing checks.
- Use the installed Herdr guide/type declarations when available. Otherwise consult
  herdrdev/herdr-app defaults/AGENTS.md and defaults/herdr.d.ts at a pinned revision.
  Runtime differences exist: do not assume upstream master matches the user's app.
- Mods have no DOM, Node APIs, setTimeout or setInterval. Use gpui-kit/gpui-base,
  Herdr exec and cx tasks. Never retain cx across callbacks.
- Keep draft persistence scoped to the reviewed machine and repository.
- Use explicit Git argument arrays and literal pathspecs. Never stage or commit
  the repository being reviewed. Preserve comments when Git or storage fails.
- Never stop or restart the user's Herdr app/core. Do not automate pointer or
  keyboard input on their real desktop. Use an isolated environment for UI tests.
