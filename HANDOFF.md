# Implementation handoff — 2026-11-20

## Goal

A small native Herdr review mod: uncommitted diff, single-line comments,
saved review draft, feedback preview and copy. Full Reviewr feature parity is
not the goal. Direct agent messaging, last-turn tracking and PR support are later work.

## Current state

Initial prototype is on branch `feat/native-review-prototype`. It has not been installed into
the user's mod directory or shown in the running app.

Verified locally on Windows:

- Six Node tests pass (status paths, old/new anchors, multiple hunks, new files,
  draft validation/scoping and stale-comment export).
- Node syntax check passes.
- Installed herdr-app reports `check passed` for the mod; exit code 0.
- Running app reports no existing errors.

Not verified: actual layout, deferred virtual-list row rendering, clipboard,
comment editing through the UI, persistence across closing/reopening and remote Git.
Do not call the prototype finished until these have been checked.

## Next work

1. Review the initial implementation for asynchronous Git/storage failure handling.
   Add adapter tests using real temporary Git repositories (staged and unstaged
   changes together, unborn HEAD, deletions, unusual paths, binary files).
2. Test/render both diff and feedback states in an isolated Herdr environment,
   or hand native validation back to the local Windows session. Current layout
   uses explicit heights plus virtual lists; narrow panels need particular care.
3. Validate persistence using the actual installed app. Its guide currently says
   localStorage is per mod copy; upstream master describes newer semantics.
4. Refine the UI based on that validation; maintain the small initial scope.

## Architecture references

- https://github.com/herdrdev/herdr-app/blob/master/defaults/AGENTS.md
- https://github.com/herdrdev/herdr-app/blob/master/defaults/herdr.d.ts
- https://github.com/herdrdev/herdr-app/blob/master/defaults/mods/changes/main.js
- https://github.com/herdrdev/herdr-core/blob/master/schema/README.md

The GUI is GPUI, not a browser. A cloud environment can run Node tests without
Herdr; native checks need a compatible Herdr installation and appropriate graphics
environment. Never claim screenshots or interaction tests from Node tests alone.
