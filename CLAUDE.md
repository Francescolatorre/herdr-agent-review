# herdr-reviewer

A Herdr mod, distributed by people copying `mods/reviewer/` or letting the
agent in their Herdr window fetch it from herdr.dev. There is no package
manager, so the version has to live in the files themselves.

## Releasing

The version is the `version` field in `mods/reviewer/mod.json`. Each release
is an annotated tag `v<version>` on main pointing at the commit that set
that field.

For every change a user would notice (behaviour, command names, props,
keys), in the same commit or PR:

1. Bump `version` in `mods/reviewer/mod.json`.
2. Update the Versions section of `README.md` with the Herdr version it was
   tested on (`herdr-app --version` and `herdr --version`).
3. Run `scripts/install.sh` (copies the mod into Herdr and runs
   `herdr-app check`; never symlink, Herdr won't reload a link) and try
   the mod in the app.
4. Keep `RECIPE.md` in step with the code; on a mismatched Herdr version the
   recipe is what users get.

After it lands on main:

```
git tag -a v<version> -m "reviewer <version>"
git push origin main v<version>
```

Patch for fixes, minor for new behaviour. No changelog until a release
changes something users must read about before upgrading. When Herdr
ships a new `changes` mod, port what is wanted and update `cloned_from`.

## Commits

Never add Co-Authored-By trailers or "Generated with" lines to commits or
PR descriptions.

## Tests

- `node --test` (Node 18 or newer, no packages) runs `tests/highlight.test.mjs`,
  the tokenizer's tests. Change `mods/reviewer/highlight.js` together with a
  test; the "spans add up to the input" test is the one the panel relies on.
- `.github/workflows/test.yml` runs it on Node 20 and 22, and runs
  `scripts/test-uninstall.sh` (when the file exists) on Linux, macOS and
  Windows, on every pull request and on pushes to `main`. A branch named
  `ci/**` also runs on push, to try a CI change first.
- Nothing tests `main.js` or the dialogs; that needs Herdr's window, so it
  stays a manual try-out in the app. There is no coverage measurement.
