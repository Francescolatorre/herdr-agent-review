#!/bin/sh
# Asks GitHub for the latest release of this mod and compares it with the version
# installed in Herdr (mods/reviewer/mod.json under the Herdr home). It only reads:
# nothing is downloaded, installed or changed. The one request goes to api.github.com
# (so GitHub sees your IP address), and only when you run this script.
#
# Exit status: 0 up to date (or newer than the latest release), 10 an update is
# available, 2 usage error, 3 could not tell (not installed, no network, no release).
#
# Usage: scripts/check-update.sh
#   HERDR_APP_HOME picks another Herdr home; REVIEWER_REPO another <owner>/<repo>
#   (default Francescolatorre/herdr-agent-review).
set -eu
case ${1:-} in
  "") ;;
  -h|--help) sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
  *) echo "usage: scripts/check-update.sh" >&2; exit 2 ;;
esac
repo=${REVIEWER_REPO:-Francescolatorre/herdr-agent-review}
home=${HERDR_APP_HOME:-${HOME:-}/.config/herdr-app}

version_of() { sed -n 's/^  "version": *"\([^"]*\)".*/\1/p' "$1" | head -n 1; }

installed=
if [ -f "$home/mods/reviewer/mod.json" ]; then installed=$(version_of "$home/mods/reviewer/mod.json"); fi
if [ -z "$installed" ]; then
  echo "Reviewer isn't installed in $home (no mods/reviewer/mod.json); run scripts/install.sh first." >&2
  exit 3
fi

url=https://api.github.com/repos/$repo/releases/latest
if ! command -v curl >/dev/null 2>&1 || ! command -v awk >/dev/null 2>&1; then
  echo "curl and awk are needed to check for updates, and one of them is missing." >&2
  exit 3
fi
# Any failure (offline, a firewall, VPN or proxy in the way, a certificate error, a
# rate limit, a login page instead of JSON) ends in the same quiet message and exit 3.
# The whole request is capped at 20 seconds.
body=$(curl -fsSL --connect-timeout 5 --max-time 20 -H 'Accept: application/vnd.github+json' "$url" 2>/dev/null) || body=
tag=$(printf '%s\n' "$body" | sed -n 's/.*"tag_name": *"\([^"]*\)".*/\1/p' | head -n 1)
if [ -z "$tag" ]; then
  echo "Could not get the latest release of $repo from GitHub: no network, a firewall, VPN or proxy in the way, a rate limit, or none published yet. Nothing was changed." >&2
  exit 3
fi
latest=${tag#v}

# newer A B: succeeds when version A is newer than B. Numeric, field by field, so
# 0.10.0 is newer than 0.9.0; a suffix such as -rc.1 or +build is ignored.
newer() {
  awk -v a="${1%%[-+]*}" -v b="${2%%[-+]*}" 'BEGIN {
    split(a, x, "."); split(b, y, ".")
    for (i = 1; i <= 3; i++) { if (x[i] + 0 > y[i] + 0) exit 0; if (x[i] + 0 < y[i] + 0) exit 1 }
    exit 1 }'
}

echo "installed: $installed"
echo "latest:    $latest  (https://github.com/$repo/releases/tag/$tag)"
if newer "$latest" "$installed"; then
  echo "Update available: $installed -> $latest."
  echo "Download herdr-reviewer-$latest.zip and its .sha256 from the release page, check the sum,"
  echo "unpack it and run scripts/install.sh from the folder."
  exit 10
elif newer "$installed" "$latest"; then
  echo "Installed is newer than the latest release (a build from before the release, or from a branch)."
else
  echo "Up to date."
fi
