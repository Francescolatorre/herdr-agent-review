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
   tested on (`herdr-app --version` and `hc --version`).
3. Run `scripts/install.sh` (copies the mod into Herdr and runs
   `herdr-app check`; never symlink, Herdr won't reload a link) and try
   the mod in the app.
4. Keep `RECIPE.md` in step with the code; on a mismatched Herdr version the
   recipe is what users get.
5. If you touched `scripts/install.sh` or `scripts/uninstall.sh`, run
   `scripts/test-uninstall.sh` (throwaway home, stub `herdr-app`, needs no
   Herdr) and say in the README's Versions section on which systems it ran.
   It is only tested on Windows (Git Bash) so far; macOS and Linux need a
   run by someone on that system.

After it lands on main, tag the commit that set the version (not the merge
commit):

```
git tag -a v<version> -m "reviewer <version>" <commit>
git push origin v<version>
```

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

Patch for fixes, minor for new behaviour. No changelog until a release
changes something users must read about before upgrading. When Herdr
ships a new `changes` mod, port what is wanted and update `cloned_from`.

## Commits

Never add Co-Authored-By trailers or "Generated with" lines to commits or
PR descriptions.
