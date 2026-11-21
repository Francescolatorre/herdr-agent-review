# Changelog

All notable changes to this project are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project follows
[Semantic Versioning](https://semver.org/) (below 1.0.0 a minor release may change
behaviour).

This is a fork of Reviewer by Vytas Gavelis (MIT). It counts its own releases from
0.1.0; the original's 0.1.0 to 0.6.0 are different releases.

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
