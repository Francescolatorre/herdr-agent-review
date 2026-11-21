#!/bin/sh
# Takes out what scripts/install.sh put into Herdr, in this order:
#
#   1. Layouts. A clone the installer made (`main-reviewer`, `terminals-reviewer`,
#      `win98-reviewer`) is never deleted, because you may have changed it since:
#      Herdr is switched back to the layout it was cloned from and the clone is
#      set aside as `<name>.json.uninstalled`. In any other layout that shows
#      `reviewer`, the block goes back to `changes`. With Herdr closed this step
#      leaves the layouts alone and says so. Herdr has no command to delete a
#      layout, which is why the file is moved.
#   2. Keys. Every binding whose action is a Reviewer one (`reviewer.*`,
#      `mod.open:reviewer-toggle`) is removed, whatever key it sits on; all
#      other keys stay.
#   3. Mods. mods/reviewer, mods/reviewer-toggle and a leftover install stage.
#
# It needs no herdr-app for steps 2 and 3; step 1 needs Herdr open. Your drafts,
# scope and "Full file" choice live in Herdr's shared.json (reviewer.*) and stay,
# so an install later finds them again. The panel width limit the installer
# raised stays too, since its old value was never stored.
#
# Usage: scripts/uninstall.sh [--no-layout] [--no-keys] [--dry-run]
#        (HERDR_APP_HOME picks another Herdr home)
set -eu
layout_step=1 keys_step=1 dry=0
for arg in "$@"; do
  case $arg in
    --no-layout) layout_step=0 ;;
    --no-keys) keys_step=0 ;;
    --dry-run|-n) dry=1 ;;
    *) echo "usage: scripts/uninstall.sh [--no-layout] [--no-keys] [--dry-run]" >&2; exit 2 ;;
  esac
done
home=${HERDR_APP_HOME:-${HOME:-}/.config/herdr-app}
case $home in
  ""|/|/.config/herdr-app) echo "refusing to work on '$home': set HERDR_APP_HOME or HOME" >&2; exit 2 ;;
esac
if [ ! -d "$home" ]; then echo "nothing to do: $home does not exist"; exit 0; fi
rc=0
say() { if [ "$dry" = 1 ]; then echo "would: $*"; else echo "$*"; fi; }
[ "$dry" = 0 ] || echo "dry run: nothing is changed"

# --- 1. layouts -------------------------------------------------------------
current_layout() {
  herdr-app status 2>/dev/null | sed -n 's/^ *"layout": *"\([^"]*\)".*/\1/p' | head -n 1
}
if [ "$layout_step" = 1 ] && [ -d "$home/layouts" ]; then
  shown=
  command -v herdr-app >/dev/null 2>&1 && shown=$(current_layout) || true
  found=0
  for file in "$home"/layouts/*.json; do
    [ -f "$file" ] || continue
    grep -q '"mod": *"reviewer"' "$file" || continue
    found=1
    name=$(basename "$file" .json)
    case $name in
      main-reviewer|terminals-reviewer|win98-reviewer)
        base=${name%-reviewer}
        if [ -z "$shown" ]; then
          echo "layout $name: Herdr isn't open, so it was left alone and still shows reviewer; run this again with Herdr open (or switch to $base and move $file aside by hand)"
          rc=1
          continue
        fi
        if [ "$shown" = "$name" ]; then
          say "layout: switch Herdr back to $base"
          if [ "$dry" = 0 ]; then
            if ! herdr-app do layout.switch "{\"name\":\"$base\"}" >/dev/null; then
              echo "layout $name: switching to $base failed, so the clone was left in place" >&2
              rc=1
              continue
            fi
            i=0
            while [ "$(current_layout)" = "$name" ] && [ $i -lt 50 ]; do sleep 0.1; i=$((i + 1)); done
            if [ "$(current_layout)" = "$name" ]; then
              echo "layout $name: Herdr is still showing it, so the clone was left in place" >&2
              rc=1
              continue
            fi
          fi
        fi
        aside=$file.uninstalled
        [ ! -e "$aside" ] || aside=$aside.$(date +%s)
        say "layout: set $name aside as $(basename "$aside")"
        if [ "$dry" = 0 ] && ! mv "$file" "$aside"; then
          echo "layout $name: could not move it aside" >&2
          rc=1
        fi
        ;;
      *)
        say "layout $name: the reviewer block goes back to changes"
        if [ "$dry" = 0 ]; then
          tmp=$file.reviewer-tmp
          if sed 's/"mod": *"reviewer"/"mod": "changes"/' "$file" > "$tmp" && mv "$tmp" "$file"; then :; else
            rm -f "$tmp"
            echo "layout $name: could not rewrite it" >&2
            rc=1
          fi
        fi
        ;;
    esac
  done
  [ "$found" = 1 ] || echo "layouts: none shows reviewer"
fi

# --- 2. keys ----------------------------------------------------------------
if [ "$keys_step" = 1 ]; then
  if [ ! -f "$home/keys.json" ]; then
    echo "keys: no keys.json, nothing to remove"
  elif python3 -c 'import json' >/dev/null 2>&1; then
    python3 - "$home/keys.json" "$dry" <<'PY2' || rc=1
import json, os, sys
dst, dry = sys.argv[1], sys.argv[2] == "1"
def ours(action):
    return isinstance(action, str) and (action.startswith("reviewer.") or action == "mod.open:reviewer-toggle")
try:
    with open(dst, encoding="utf-8") as f: mine = json.load(f)
except ValueError as e:
    print("keys: %s is not valid JSON (%s); remove the Reviewer keys by hand" % (dst, e)); sys.exit(1)
removed = []
for section, keys in mine.items():
    if not isinstance(keys, dict): continue
    for key in [k for k, a in keys.items() if ours(a)]:
        removed.append("%s %s" % (key, keys[key]))
        if not dry: del keys[key]
if not removed:
    print("keys: none of the Reviewer keys is bound")
else:
    if not dry:
        with open(dst + ".reviewer-tmp", "w", encoding="utf-8") as f: json.dump(mine, f, indent=2, ensure_ascii=False); f.write("\n")
        os.replace(dst + ".reviewer-tmp", dst)
    print(("would: remove keys " if dry else "keys: removed ") + ", ".join(removed))
PY2
  else
    echo "keys: python3 isn't usable here, so keys.json was left alone; remove every binding to reviewer.* and mod.open:reviewer-toggle from $home/keys.json by hand"
    rc=1
  fi
fi

# --- 3. mods ----------------------------------------------------------------
for mod in reviewer reviewer-toggle; do
  dest=$home/mods/$mod
  if [ -L "$dest" ]; then
    echo "mods: $dest is a symlink, so it was left alone; remove it yourself" >&2
    rc=1
  elif [ -d "$dest" ]; then
    say "mods: remove $dest"
    if [ "$dry" = 0 ] && ! rm -rf "$dest"; then
      echo "mods: could not remove $dest (a running Herdr may hold files open; close it and run this again)" >&2
      rc=1
    fi
  else
    echo "mods: $mod is not installed"
  fi
done
stage=$home/.reviewer-install
if [ -d "$stage" ]; then
  say "mods: remove the leftover install stage $stage"
  if [ "$dry" = 0 ]; then rm -rf "$stage" || rc=1; fi
fi

if [ "$rc" = 0 ]; then
  [ "$dry" = 1 ] || echo "done. Your drafts stay in Herdr's shared.json; scripts/install.sh brings Reviewer back."
else
  echo "finished with problems, see above" >&2
fi
exit $rc
