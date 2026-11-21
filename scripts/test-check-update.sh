#!/bin/sh
# Tests scripts/check-update.sh against a throwaway HERDR_APP_HOME and a stub `curl`,
# so it needs no network and never asks GitHub. Needs sh only. Safe to run anywhere.
#
# Usage: scripts/test-check-update.sh
set -u
repo=$(cd "$(dirname "$0")/.." && pwd)
work=$(mktemp -d 2>/dev/null || mktemp -d -t reviewer-check)
trap 'rm -rf "$work"' 0
pass=0 fail=0
ok() { pass=$((pass + 1)); echo "  ok   $1"; }
bad() { fail=$((fail + 1)); echo "  FAIL $1"; }
check() { desc=$1; shift; if "$@" >/dev/null 2>&1; then ok "$desc"; else bad "$desc"; fi; }

# A stub curl: prints $STUB_BODY (a file) and exits $STUB_EXIT, and logs its arguments.
mkdir -p "$work/bin"
cat > "$work/bin/curl" <<'STUB'
#!/bin/sh
printf '%s\n' "$*" >> "${STUB_LOG:?}"
[ "${STUB_EXIT:-0}" = 0 ] || exit "$STUB_EXIT"
cat "${STUB_BODY:?}"
STUB
chmod +x "$work/bin/curl"
PATH="$work/bin:$PATH"; export PATH
STUB_LOG=$work/curl.log; export STUB_LOG

HERDR_APP_HOME=$work/home; export HERDR_APP_HOME
install_version() { mkdir -p "$HERDR_APP_HOME/mods/reviewer"; printf '{\n  "place": "none",\n  "version": "%s",\n  "cloned_from": {\n    "name": "changes",\n    "version": "0.1.8"\n  }\n}\n' "$1" > "$HERDR_APP_HOME/mods/reviewer/mod.json"; }
release() { printf '{\n  "url": "x",\n  "tag_name": "%s",\n  "draft": false,\n  "prerelease": false\n}\n' "$1" > "$work/body.json"; STUB_BODY=$work/body.json; export STUB_BODY; }
run() { : > "$STUB_LOG"; sh "$repo/scripts/check-update.sh" "$@" > "$work/out" 2>&1; rc=$?; }

echo "versions"
install_version 0.1.0; release v0.1.0; run
check "equal versions: exit 0" test "$rc" = 0
check "equal versions: says up to date" grep -q 'Up to date' "$work/out"
check "it shows both versions" grep -q 'installed: 0.1.0' "$work/out"
install_version 0.1.0; release v0.2.0; run
check "newer release: exit 10" test "$rc" = 10
check "newer release: names the update" grep -q 'Update available: 0.1.0 -> 0.2.0' "$work/out"
check "newer release: links the release page" grep -q 'releases/tag/v0.2.0' "$work/out"
install_version 0.9.0; release v0.10.0; run
check "0.10.0 is newer than 0.9.0 (numbers, not text)" test "$rc" = 10
install_version 0.8.1; release v0.1.0; run
check "installed ahead of the release: exit 0" test "$rc" = 0
check "installed ahead: says so" grep -q 'newer than the latest release' "$work/out"
install_version 0.2.0; release v0.2.0-rc.1; run
check "a pre-release suffix does not count as newer" test "$rc" = 0
install_version 0.2.0-rc.1; release v0.2.0; run
check "a suffix on the installed one is ignored too" test "$rc" = 0

echo "what it asks"
install_version 0.1.0; release v0.1.0; run
check "it asks the releases/latest endpoint" grep -q 'api.github.com/repos/Francescolatorre/herdr-agent-review/releases/latest' "$STUB_LOG"
REVIEWER_REPO=someone/else; export REVIEWER_REPO; run
check "REVIEWER_REPO changes the repository" grep -q 'repos/someone/else/releases/latest' "$STUB_LOG"
unset REVIEWER_REPO
check "it makes exactly one request" test "$(wc -l < "$STUB_LOG" | tr -d ' ')" = 1
check "the request is capped: a connect timeout and a total time" grep -q -e '--connect-timeout 5 --max-time 20' "$STUB_LOG"
check "it asks for nothing but a quiet failure (-f)" grep -q -e '-fsSL' "$STUB_LOG"

echo "it only reads"
install_version 0.1.0; release v0.5.0
before=$(cd "$HERDR_APP_HOME" && find . -type f | sort | while read -r f; do printf '%s ' "$f"; cksum < "$f"; done)
run
after=$(cd "$HERDR_APP_HOME" && find . -type f | sort | while read -r f; do printf '%s ' "$f"; cksum < "$f"; done)
check "the Herdr home is left as it was" test "$before" = "$after"

echo "when it can't tell"
install_version 0.1.0; STUB_EXIT=22; export STUB_EXIT; run
check "curl failing: exit 3" test "$rc" = 3
check "curl failing: says why" grep -q 'Could not get the latest release' "$work/out"
# What a firewall, a VPN or a proxy does to the request: every curl failure ends the same way.
for code in 6 7 28 35 56 60 22; do
  STUB_EXIT=$code; export STUB_EXIT; run
  check "curl exit $code (blocked, timed out, certificate, 403): exit 3, a calm message" sh -c "[ $rc = 3 ] && grep -q 'firewall, VPN or proxy' '$work/out' && ! grep -q -i -E 'error:|not found|usage' '$work/out'"
done
unset STUB_EXIT
printf '<html><body>Please log in to the guest network</body></html>\n' > "$work/body.json"; run
check "a login page instead of JSON: exit 3, no crash" sh -c "[ $rc = 3 ] && grep -q 'Could not get' '$work/out'"
printf '{ "message": "API rate limit exceeded for 203.0.113.9." }\n' > "$work/body.json"; run
check "a rate-limit answer: exit 3" test "$rc" = 3
printf '' > "$work/body.json"; run
check "an empty answer: exit 3" test "$rc" = 3
printf '{ "tag_name": ' > "$work/body.json"; run
check "a cut-off answer: exit 3" test "$rc" = 3
printf '{ "message": "Not Found" }\n' > "$work/body.json"; run
check "no release yet: exit 3" test "$rc" = 3
rm -rf "$HERDR_APP_HOME/mods"; release v0.1.0; run
check "not installed: exit 3" test "$rc" = 3
check "not installed: says so and does not ask GitHub" sh -c "grep -q \"isn't installed\" '$work/out' && [ ! -s '$STUB_LOG' ]"
HERDR_APP_HOME=$work/nowhere run
check "a missing home is handled the same way" test "$rc" = 3
HERDR_APP_HOME=$work/home

echo "usage"
run --bogus
check "an unknown option exits 2" test "$rc" = 2
run --help
check "--help exits 0 and shows the usage" sh -c "[ $rc = 0 ] && grep -q 'Exit status' '$work/out'"

echo
echo "$pass passed, $fail failed"
[ "$fail" = 0 ]
