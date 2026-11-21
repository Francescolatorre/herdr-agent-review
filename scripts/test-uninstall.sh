#!/bin/sh
# Runs install.sh and uninstall.sh against a throwaway HERDR_APP_HOME and a
# stub `herdr-app`, so it needs no Herdr, no window and no network. It checks the
# file logic only; the UI cases (the panel opens, the keys work) stay manual.
# Needs sh and python3. Safe to run anywhere: it never touches your real Herdr
# home, and the stub stands in for herdr-app so your window is never driven.
#
# Usage: scripts/test-uninstall.sh
set -u
repo=$(cd "$(dirname "$0")/.." && pwd)
python3 -c 'import json' >/dev/null 2>&1 || { echo "needs a working python3" >&2; exit 2; }
work=$(mktemp -d 2>/dev/null || mktemp -d -t reviewer-test)
trap 'rm -rf "$work"' 0
pass=0 fail=0
ok() { pass=$((pass + 1)); echo "  ok   $1"; }
bad() { fail=$((fail + 1)); echo "  FAIL $1"; }
check() { desc=$1; shift; if "$@" >/dev/null 2>&1; then ok "$desc"; else bad "$desc"; fi; }
absent() { desc=$1; shift; if "$@" >/dev/null 2>&1; then bad "$desc"; else ok "$desc"; fi; }

# A stub herdr-app: `check` passes, `status` reports the layout in .stub-layout
# (no file = Herdr closed), layout.clone copies, layout.switch records.
mkdir -p "$work/bin"
cat > "$work/bin/herdr-app" <<'STUB'
#!/bin/sh
home=${HERDR_APP_HOME:?}
case "$1" in
  check) [ -f "$2/mod.json" ] ;;
  status)
    [ -s "$home/.stub-layout" ] || exit 1
    printf '{\n  "layout": "%s",\n  "errors": []\n}\n' "$(cat "$home/.stub-layout")" ;;
  do)
    case "$2" in
      layout.clone)
        from=$(printf '%s' "$3" | sed -n 's/.*"name":"\([^"]*\)".*/\1/p')
        as=$(printf '%s' "$3" | sed -n 's/.*"as":"\([^"]*\)".*/\1/p')
        cp "$home/layouts/$from.json" "$home/layouts/$as.json"
        printf '%s' "$as" > "$home/.stub-layout" ;;
      layout.switch)
        printf '%s' "$3" | sed -n 's/.*"name":"\([^"]*\)".*/\1/p' | tr -d '\n' > "$home/.stub-layout" ;;
    esac ;;
  *) exit 1 ;;
esac
STUB
chmod +x "$work/bin/herdr-app"
PATH="$work/bin:$PATH"; export PATH

new_home() { # new_home <name> [layout shown by Herdr; empty = closed]
  HERDR_APP_HOME=$work/$1; export HERDR_APP_HOME
  rm -rf "$HERDR_APP_HOME"; mkdir -p "$HERDR_APP_HOME/layouts" "$HERDR_APP_HOME/mods"
  cat > "$HERDR_APP_HOME/keys.json" <<'JSON'
{
  "global": { "ctrl-k": "palette.open" },
  "terminal": { "ctrl-left": "send:b" }
}
JSON
  cat > "$HERDR_APP_HOME/layouts/main.json" <<'JSON'
{ "id": "root", "type": "row", "children": [
  { "id": "work", "type": "column", "children": [
    { "id": "work-body", "type": "row", "children": [
      { "id": "panel", "type": "column", "hidden": true, "min": 280, "max": 900, "children": [
        { "id": "panel-body", "type": "stack", "active": "files", "children": [
          { "id": "files", "type": "block", "content": { "mod": "files" } },
          { "id": "changes", "type": "block", "content": { "mod": "changes" } } ] } ] } ] } ] } ] }
JSON
  if [ -n "${2:-}" ]; then printf '%s' "$2" > "$HERDR_APP_HOME/.stub-layout"; fi
}
keys_equal() { python3 - "$1" "$2" <<'PY'
import json, sys
sys.exit(0 if json.load(open(sys.argv[1], encoding="utf-8")) == json.load(open(sys.argv[2], encoding="utf-8")) else 1)
PY
}
mark() { cp "$HERDR_APP_HOME/keys.json" "$work/keys.before"; cp "$HERDR_APP_HOME/layouts/main.json" "$work/main.before"; }
snapshot() { (cd "$HERDR_APP_HOME" && find . -type f -not -name '.stub-layout' | sort | while read -r f; do printf '%s ' "$f"; cksum < "$f"; done); }

echo "round trip on a shipped layout (Herdr open on main)"
new_home rt main; mark
"$repo/scripts/install.sh" >/dev/null 2>&1 || bad "install.sh ran"
check "install put reviewer in place" test -f "$HERDR_APP_HOME/mods/reviewer/mod.json"
check "install bound the keys" grep -q 'mod.open:reviewer-toggle' "$HERDR_APP_HOME/keys.json"
check "install cloned the layout" test -f "$HERDR_APP_HOME/layouts/main-reviewer.json"
"$repo/scripts/uninstall.sh" > "$work/out" 2>&1; rc=$?
check "uninstall exits 0" test "$rc" = 0
absent "reviewer is gone" test -e "$HERDR_APP_HOME/mods/reviewer"
absent "reviewer-toggle is gone" test -e "$HERDR_APP_HOME/mods/reviewer-toggle"
check "keys.json is back to what it was" keys_equal "$work/keys.before" "$HERDR_APP_HOME/keys.json"
check "main layout is untouched" cmp -s "$work/main.before" "$HERDR_APP_HOME/layouts/main.json"
absent "the clone is no longer a layout" test -e "$HERDR_APP_HOME/layouts/main-reviewer.json"
check "the clone is kept aside, not deleted" test -f "$HERDR_APP_HOME/layouts/main-reviewer.json.uninstalled"
check "Herdr was switched back to main" test "$(cat "$HERDR_APP_HOME/.stub-layout")" = main
"$repo/scripts/uninstall.sh" > "$work/out2" 2>&1; rc=$?
check "a second run exits 0" test "$rc" = 0
check "a second run says so" grep -q 'not installed' "$work/out2"
"$repo/scripts/install.sh" >/dev/null 2>&1; check "install works again afterwards" test -f "$HERDR_APP_HOME/mods/reviewer/mod.json"

echo "a hand-edited clone comes back after uninstall and install"
new_home keep main
"$repo/scripts/install.sh" >/dev/null 2>&1
python3 - "$HERDR_APP_HOME/layouts/main-reviewer.json" <<'PY'
import json, sys
p = sys.argv[1]; t = json.load(open(p, encoding="utf-8"))
t["note"] = "edited by hand"
json.dump(t, open(p, "w", encoding="utf-8"), indent=2)
PY
cp "$HERDR_APP_HOME/layouts/main-reviewer.json" "$work/clone.before"
"$repo/scripts/uninstall.sh" >/dev/null 2>&1
"$repo/scripts/install.sh" > "$work/out" 2>&1; rc=$?
check "install exits 0" test "$rc" = 0
check "the clone is back exactly as it was" cmp -s "$work/clone.before" "$HERDR_APP_HOME/layouts/main-reviewer.json"
absent "nothing is left aside" sh -c "ls '$HERDR_APP_HOME'/layouts/*.uninstalled*"
check "Herdr was switched to the clone" test "$(cat "$HERDR_APP_HOME/.stub-layout")" = main-reviewer
check "it says it restored it" grep -q 'restored the one' "$work/out"
"$repo/scripts/uninstall.sh" >/dev/null 2>&1; "$repo/scripts/uninstall.sh" >/dev/null 2>&1
"$repo/scripts/install.sh" >/dev/null 2>&1
check "uninstall twice in a row does not lose the clone" test -f "$HERDR_APP_HOME/layouts/main-reviewer.json"

echo "dry run changes nothing"
new_home dry main
"$repo/scripts/install.sh" >/dev/null 2>&1
snapshot > "$work/snap.before"
"$repo/scripts/uninstall.sh" --dry-run > "$work/out" 2>&1; rc=$?
snapshot > "$work/snap.after"
check "dry run exits 0" test "$rc" = 0
check "dry run left every file as it was" cmp -s "$work/snap.before" "$work/snap.after"
check "dry run says what it would do" grep -q '^would: ' "$work/out"

echo "keys: rebound, other sections, other keys"
new_home keys main
"$repo/scripts/install.sh" >/dev/null 2>&1
python3 - "$HERDR_APP_HOME/keys.json" <<'PY'
import json, sys
p = sys.argv[1]; d = json.load(open(p, encoding="utf-8"))
d["global"]["ctrl-alt-r"] = "reviewer.submit"
d.setdefault("terminal", {})["ctrl-alt-s"] = "reviewer.scope"
json.dump(d, open(p, "w", encoding="utf-8"), indent=2)
PY
"$repo/scripts/uninstall.sh" --no-layout >/dev/null 2>&1
absent "a rebound reviewer key is removed" grep -q 'reviewer\.' "$HERDR_APP_HOME/keys.json"
check "an unrelated global key stays" grep -q 'palette.open' "$HERDR_APP_HOME/keys.json"
check "an unrelated terminal key stays" grep -q 'send:b' "$HERDR_APP_HOME/keys.json"
check "--no-layout kept the clone as a layout" test -f "$HERDR_APP_HOME/layouts/main-reviewer.json"

echo "personal layout"
new_home own mine
cp "$HERDR_APP_HOME/layouts/main.json" "$HERDR_APP_HOME/layouts/mine.json"
"$repo/scripts/install.sh" >/dev/null 2>&1
check "install edited the personal layout in place" grep -q '"mod": "reviewer"' "$HERDR_APP_HOME/layouts/mine.json"
"$repo/scripts/uninstall.sh" >/dev/null 2>&1
check "the block is a changes block again" grep -q '"mod": "changes"' "$HERDR_APP_HOME/layouts/mine.json"
absent "no reviewer block is left" grep -q '"mod": "reviewer"' "$HERDR_APP_HOME/layouts/mine.json"
absent "a personal layout is not set aside" test -e "$HERDR_APP_HOME/layouts/mine.json.uninstalled"

echo "Herdr closed"
new_home shut main
"$repo/scripts/install.sh" >/dev/null 2>&1
rm -f "$HERDR_APP_HOME/.stub-layout"
"$repo/scripts/uninstall.sh" > "$work/out" 2>&1; rc=$?
check "exits non-zero, because a layout still shows reviewer" test "$rc" != 0
check "the clone was left alone" test -f "$HERDR_APP_HOME/layouts/main-reviewer.json"
check "it says to run again with Herdr open" grep -q "isn't open" "$work/out"
absent "mods are removed anyway" test -e "$HERDR_APP_HOME/mods/reviewer"
check "keys are removed anyway" sh -c "! grep -q 'reviewer\\.' '$HERDR_APP_HOME/keys.json'"

echo "python3 that exists but doesn't run (the Windows Store alias)"
new_home nopy main
"$repo/scripts/install.sh" >/dev/null 2>&1
mkdir -p "$work/nopy"; printf '#!/bin/sh\nexit 9\n' > "$work/nopy/python3"; chmod +x "$work/nopy/python3"
PATH="$work/nopy:$PATH" "$repo/scripts/uninstall.sh" --no-layout > "$work/out" 2>&1; rc=$?
check "exits non-zero" test "$rc" != 0
check "keys.json is left alone and the way to fix it is named" grep -q 'by hand' "$work/out"
absent "the mods were still removed" test -e "$HERDR_APP_HOME/mods/reviewer"

echo "symlinked mod and unusable home"
new_home link main
mkdir -p "$work/elsewhere"; ln -s "$work/elsewhere" "$HERDR_APP_HOME/mods/reviewer" 2>/dev/null
if [ -L "$HERDR_APP_HOME/mods/reviewer" ]; then
  "$repo/scripts/uninstall.sh" --no-layout --no-keys >/dev/null 2>&1; rc=$?
  check "a symlinked mod is refused" test "$rc" != 0
  check "the link target survives" test -d "$work/elsewhere"
else
  echo "  skip symlink case (this shell can't make symlinks)"
fi
HERDR_APP_HOME=$work/does-not-exist "$repo/scripts/uninstall.sh" >/dev/null 2>&1; rc=$?
check "a missing home is not an error" test "$rc" = 0
HERDR_APP_HOME=/ "$repo/scripts/uninstall.sh" >/dev/null 2>&1; rc=$?
check "the filesystem root is refused" test "$rc" = 2

echo
echo "$pass passed, $fail failed"
[ "$fail" = 0 ]
