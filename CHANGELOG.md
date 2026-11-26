# Changelog

All notable changes to this project are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows
[Semantic Versioning](https://semver.org/) (below 1.0.0 a minor release may change
behaviour).

This is a fork of Reviewer by Vytas Gavelis (MIT). It counts its own releases from
0.1.0; the original's 0.1.0 to 0.6.0 are different releases.

## [0.3.0](https://github.com/Francescolatorre/herdr-agent-review/compare/v0.2.0...v0.3.0) (2026-11-26)


### Features

* draw Mermaid fences in the Markdown document view ([02c2c0b](https://github.com/Francescolatorre/herdr-agent-review/commit/02c2c0b776b8826445770bfc9aef172c7a4f9b99))
* draw Mermaid fences in the Markdown document view ([7c73194](https://github.com/Francescolatorre/herdr-agent-review/commit/7c73194b9de35cd7683461dd1f16a3a09921a5d7))
* list gitignored files by default, with a hide gitignored files toggle ([240089f](https://github.com/Francescolatorre/herdr-agent-review/commit/240089ffd42733c19f72bf3f9e79211b5926ead3))
* list gitignored files by default, with a hide gitignored files toggle ([9ca7b8a](https://github.com/Francescolatorre/herdr-agent-review/commit/9ca7b8ae3e42c185236f6a5ff14d7df7667825ee))
* list open pull and merge requests in the reviewer.pr dialog ([668ba64](https://github.com/Francescolatorre/herdr-agent-review/commit/668ba64783f4732b16fb6ea5c63bfc4a3497c44a))
* move a popped-out diagram by dragging it with a hand cursor ([7f4774b](https://github.com/Francescolatorre/herdr-agent-review/commit/7f4774b85bb145e851c57fdf8485f3eba46c83ab))
* open the pull request dialog from a button in the panel header ([6c2aecf](https://github.com/Francescolatorre/herdr-agent-review/commit/6c2aecf34cfc5d660391da36f035829b49e14221))
* pop a Mermaid diagram out into its own overlay on request ([f1bffc5](https://github.com/Francescolatorre/herdr-agent-review/commit/f1bffc5f1471ea293b6cb1a1b7acfc54d096ab9c))
* read Markdown files as commentable blocks in All files ([530b7c7](https://github.com/Francescolatorre/herdr-agent-review/commit/530b7c7fe8f1639896cdfa32084776ef6569ffb4))
* read Markdown files as commentable blocks in All files ([2c25ad8](https://github.com/Francescolatorre/herdr-agent-review/commit/2c25ad809bca87d3b29f4c49c7de51319e041feb))
* review a pull or merge request in a separate worktree ([edd081d](https://github.com/Francescolatorre/herdr-agent-review/commit/edd081ddd121063271d6dcfa4376f6569a007da4))
* review a pull or merge request in a worktree ([1f224b8](https://github.com/Francescolatorre/herdr-agent-review/commit/1f224b882967c8fb893ca1c9835c18667a928150))
* show which folder the reviewer is looking at ([fa7b31b](https://github.com/Francescolatorre/herdr-agent-review/commit/fa7b31b822befb2571ccc0cd75aadbb40a146e8b))
* show which folder the reviewer is looking at ([d57fbf9](https://github.com/Francescolatorre/herdr-agent-review/commit/d57fbf935bfe9bb11cdbdb9df6ecba4c8b951ba2))


### Bug Fixes

* fit Mermaid diagrams to the panel width, scroll sideways, add Actual size ([3d4d6ec](https://github.com/Francescolatorre/herdr-agent-review/commit/3d4d6ecd706395b55f540d3515bfc933d3fd3b0e))
* keep a pull request pinned to its own space and let go of it cleanly ([d63a298](https://github.com/Francescolatorre/herdr-agent-review/commit/d63a29800fc3e96d7a1530395e844bd4354c983a))
* keep the grab cursor over the picture and the closed hand while dragging ([7f5d4dd](https://github.com/Francescolatorre/herdr-agent-review/commit/7f5d4dd02262183b572c0543ae067b6be00c31ba))
* let ELK start where setTimeout throws (flowchart and state diagrams) ([f5c6edf](https://github.com/Francescolatorre/herdr-agent-review/commit/f5c6edff3356e5f52c8a5c39ee1f677bbe2ee8ae))

## [0.2.0](https://github.com/Francescolatorre/herdr-agent-review/compare/v0.1.0...v0.2.0) (2026-11-23)


### Features

* check for a newer release with scripts/check-update.sh and an opt-in hint in the mod ([#9](https://github.com/Francescolatorre/herdr-agent-review/issues/9)) ([24385e4](https://github.com/Francescolatorre/herdr-agent-review/commit/24385e48f35628671abf551747fda3f8186f674d))
* review all files in the focused worktree or folder ([#10](https://github.com/Francescolatorre/herdr-agent-review/issues/10)) ([9a897dc](https://github.com/Francescolatorre/herdr-agent-review/commit/9a897dce78685b5bb6b549161b940b745ab29dc4))


### Bug Fixes

* browse the folder when Git has no work tree (bare repository) and say why ([#12](https://github.com/Francescolatorre/herdr-agent-review/issues/12)) ([4cb0027](https://github.com/Francescolatorre/herdr-agent-review/commit/4cb0027c872d56f083f30e3405adfefc37dcc0fd))

## [Unreleased]

## [0.1.0] - 2026-11-21

First release of this fork, based on Reviewer 0.6.0 by Vytas Gavelis.

### Added
- Keys: `ctrl-shift-r` opens Reviewer in the side panel or closes it, `ctrl-shift-enter`
  submits the shown scope's draft comments, `ctrl-shift-a` asks the agent about the whole
  diff, `ctrl-shift-s` cycles the scope. `scripts/install.sh` adds only keys you have not
  bound yet and names the ones it left alone.
- The `reviewer-toggle` helper mod that `ctrl-shift-r` opens.
- `scripts/uninstall.sh`: puts back what `install.sh` changed (layouts, keys, mods) and
  never deletes a layout you may have edited; it has `--dry-run`, `--no-layout` and
  `--no-keys`.
- `scripts/install.sh` puts back a `<name>-reviewer` layout that `uninstall.sh` set aside,
  so a layout you edited by hand survives an uninstall and install.
- Tests: `scripts/test-uninstall.sh` for both scripts (no Herdr needed), and `node --test`
  for the diff tokenizer and the send fallback. CI runs them on Linux, macOS and Windows.
- Release builds: `scripts/build-release.sh` and a workflow that publishes a zip with its
  checksum for every `v*` tag.

### Changed
- Works with herdr-app 0.1.16 and hc 0.1.21. The send dialog opens modal and knows the
  space and folder it came from.

### Fixed
- When the send dialog cannot open, the text goes straight to the space's agent again, as
  the recipe always described. An agent that is working or blocked gets nothing, and every
  failure keeps your drafts.

[Unreleased]: https://github.com/Francescolatorre/herdr-agent-review/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Francescolatorre/herdr-agent-review/releases/tag/v0.1.0
