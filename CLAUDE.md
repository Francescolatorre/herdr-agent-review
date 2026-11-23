# herdr-reviewer

A Herdr mod, distributed by people copying `mods/reviewer/` or letting the
agent in their Herdr window fetch it from herdr.dev. There is no package
manager, so the version has to live in the files themselves.

## Releasing

Die Linie startet bei 0.1.0; 0.1.0 bis 0.6.0 des Originals sind andere Releases.

Release Please owns the version in `mods/reviewer/mod.json`. Use Conventional
Commits for changes reaching main, including the PR title for squash merges.
`fix:` means patch, `feat:` means minor, and `feat!:` or a
`BREAKING CHANGE:` footer signals a breaking change. Leave version fields
and release tags to the release workflow after the initial manual v0.1.0.
Release Please maintains CHANGELOG.md from that baseline.

On pushes to main the workflow updates a release PR containing the proposed
version and changelog. A maintainer reviews and merges it to publish the
GitHub release and its `v<version>` tag. For initial setup, enable
“Allow GitHub Actions to create and approve pull requests” in the repository's
Actions settings. Approving the release remains a maintainer decision.

Keep README.md and RECIPE.md in step with behaviour. Run the applicable
tests (including `scripts/test-uninstall.sh` for installer changes) and `scripts/install.sh` (stages and checks the mod) and try it in
Herdr. When porting changes from Herdr's shipped mod, update `cloned_from`.

## Scripts

- `scripts/install.sh` puts the mods, keys and layout into Herdr;
  `scripts/uninstall.sh` takes them out again (`--dry-run` first).
- Both act on the real Herdr home (`~/.config/herdr-app`, or
  `$HERDR_APP_HOME`) and on the layout of the open window. Before running them
  there, copy `keys.json`, `layouts/` and `mods/reviewer*` somewhere safe.
- An install → uninstall → install round trip keeps a `<name>-reviewer`
  layout you edited by hand: the uninstaller sets it aside as
  `<name>.json.uninstalled` and the next install puts it back instead of
  cloning anew. Still back it up first when you test on the real home.
- `scripts/test-uninstall.sh` never touches the real home; prefer it for
  everything the stub can cover and keep the real-app run for the UI.

## GitHub CLI

`gh pr edit` and `gh pr create` can fail here with a GraphQL error about
Projects (classic). Use the REST API instead, for example
`gh api -X PATCH repos/<owner>/<repo>/pulls/<n> -f base=main`,
`gh api -X POST repos/<owner>/<repo>/pulls -f title=… -f head=… -f base=main -F body=@file`
and `gh api -X PUT repos/<owner>/<repo>/pulls/<n>/merge -f merge_method=merge`.

## Commits

Never add Co-Authored-By trailers or "Generated with" lines to commits or
PR descriptions.

## Tests

- `node --test` (Node 20.19+ or 22.12+, no packages) discovers the suite, including `tests/highlight.test.mjs`,
  the tokenizer's tests. Change `mods/reviewer/highlight.js` together with a
  test; the "spans add up to the input" test is the one the panel relies on.
- `.github/workflows/test.yml` runs it on Node 20 and 22, and runs
  `scripts/test-uninstall.sh` (when the file exists) on Linux, macOS and
  Windows, on every pull request and on pushes to `main`. A branch named
  `ci/**` also runs on push, to try a CI change first.
- The panel and send fallback have host-stub tests. Visual behaviour needs Herdr's window, so it
  stays a manual try-out in the app. There is no coverage measurement.
