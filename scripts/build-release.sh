#!/bin/sh
# Builds what a release publishes, into <outdir> (default: dist/):
#   herdr-reviewer-<version>.zip          the files a user needs, from the commit
#                                         checked out (git archive, so no stray files)
#   herdr-reviewer-<version>.zip.sha256   its checksum
#   RELEASE_NOTES.md                      the CHANGELOG.md entry for <version>
# <version> is the `version` field in mods/reviewer/mod.json. It fails when
# CHANGELOG.md has no entry for that version, so a version can't be bumped without
# writing down what changed. The release workflow calls this; CI runs it on every
# pull request to keep it working. Needs git, sed and awk; no zip tool.
#
# Usage: scripts/build-release.sh [outdir]
set -eu
repo=$(cd "$(dirname "$0")/.." && pwd)
out=${1:-$repo/dist}
version=$(sed -n 's/^  "version": *"\([^"]*\)".*/\1/p' "$repo/mods/reviewer/mod.json" | head -n 1)
[ -n "$version" ] || { echo "no version in mods/reviewer/mod.json" >&2; exit 1; }

# The changelog entry: the lines under "## [<version>]" up to the next "## [".
notes=$(awk -v h="## [$version]" '
  index($0, h) == 1 { on = 1; next }
  on && /^## \[/ { exit }
  on { print }
' "$repo/CHANGELOG.md" | sed -e '/./,$!d')
[ -n "$notes" ] || { echo "CHANGELOG.md has no entry for $version (a '## [$version] - <date>' section with content)" >&2; exit 1; }

mkdir -p "$out"
name=herdr-reviewer-$version
rm -f "$out/$name.zip" "$out/$name.zip.sha256"
git -C "$repo" archive --format=zip --prefix="$name/" -o "$out/$name.zip" HEAD -- \
  mods/reviewer mods/reviewer-toggle scripts keys.json README.md RECIPE.md CHANGELOG.md LICENSE THIRD-PARTY-NOTICES
printf '%s\n' "$notes" > "$out/RELEASE_NOTES.md"
(
  cd "$out"
  if command -v sha256sum >/dev/null 2>&1; then sha256sum "$name.zip" > "$name.zip.sha256"
  else shasum -a 256 "$name.zip" > "$name.zip.sha256"; fi
)
echo "built $out/$name.zip ($(wc -c < "$out/$name.zip") bytes), its checksum and the notes for $version"
