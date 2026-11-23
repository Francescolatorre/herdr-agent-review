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
tests and `scripts/install.sh` (stages and checks the mod) and try it in
Herdr. When porting changes from Herdr's shipped mod, update `cloned_from`.

## Commits

Never add Co-Authored-By trailers or "Generated with" lines to commits or
PR descriptions.
