#!/bin/sh
# Installs this checkout's mods/reviewer into Herdr, replacing what is there,
# and checks that it loads. Run it again after every checkout or edit: Herdr
# reloads the panel in place when the files change. A symlink will not do,
# Herdr never reloads a linked mod folder.
#
# With the Herdr window open it then puts Reviewer where the Changes panel
# is: in the shown layout it swaps the `changes` block's mod for `reviewer`.
# Herdr's own layouts are read-only, so a shipped one (say `main`) is first
# cloned as `<name>-reviewer`, which Herdr switches to; a layout you cloned
# yourself is edited in place. Herdr can't dock a new mod into a shipped
# layout, which is why this step exists.
#
# It also installs mods/reviewer-toggle (what ctrl-shift-r opens: it shows or
# hides Reviewer's block, which a single key command can't do) and adds the
# repo's keys.json to the person's keys.json: only keys they haven't bound,
# never replacing one they use.
#
# Usage: scripts/install.sh [--no-layout] [--no-keys]   (HERDR_APP_HOME picks another Herdr home)
set -eu
layout_step=1 keys_step=1
for arg in "$@"; do
  case $arg in
    --no-layout) layout_step=0 ;;
    --no-keys) keys_step=0 ;;
    *) echo "usage: scripts/install.sh [--no-layout] [--no-keys]" >&2; exit 2 ;;
  esac
done
repo=$(cd "$(dirname "$0")/.." && pwd)
src=$(cd "$(dirname "$0")/../mods/reviewer" && pwd)
home=${HERDR_APP_HOME:-$HOME/.config/herdr-app}
dest=$home/mods/reviewer
[ -f "$src/mod.json" ] || { echo "no mod at $src" >&2; exit 1; }
command -v herdr-app >/dev/null || { echo "herdr-app is not on PATH" >&2; exit 1; }
mkdir -p "$home/mods"
stage=$home/.reviewer-install
mkdir "$stage" || { echo "another Reviewer install may be in progress ($stage)" >&2; exit 1; }
cleanup_install() {
  if [ -d "$stage/previous" ] && [ ! -e "$dest" ]; then
    if ! mv "$stage/previous" "$dest"; then
      echo "could not restore the previous Reviewer; the backup is at $stage/previous" >&2
      return 1
    fi
  fi
  rm -rf "$stage"
}
trap cleanup_install 0
trap 'exit 1' HUP INT TERM

if [ -L "$dest" ]; then echo "$dest is a symlink; remove it first (Herdr never reloads a linked mod)" >&2; exit 1; fi
mkdir "$stage/reviewer"
cp -R "$src/." "$stage/reviewer/"
for generated in jsconfig.json gpui-kit.d.ts; do
  if [ -f "$dest/$generated" ]; then
    cp -p "$dest/$generated" "$stage/reviewer/$generated"
  fi
done
herdr-app check "$stage/reviewer" || exit 1
if [ -d "$dest" ]; then
  mv "$dest" "$stage/previous"
fi
mv "$stage/reviewer" "$dest"
version=$(sed -n 's/.*"version": *"\([^"]*\)".*/\1/p' "$dest/mod.json" | head -n 1)
echo "reviewer ${version:-?} installed in $dest"

# The key helper: a small overlay mod that toggles Reviewer's block and closes
# itself. Installed the same way (staged, checked, then swapped in).
toggle_src=$repo/mods/reviewer-toggle toggle_dest=$home/mods/reviewer-toggle
if [ -f "$toggle_src/mod.json" ]; then
  if [ -L "$toggle_dest" ]; then echo "$toggle_dest is a symlink; remove it first" >&2; exit 1; fi
  mkdir "$stage/reviewer-toggle"
  cp -R "$toggle_src/." "$stage/reviewer-toggle/"
  herdr-app check "$stage/reviewer-toggle" || exit 1
  rm -rf "$toggle_dest"
  mv "$stage/reviewer-toggle" "$toggle_dest"
  echo "reviewer-toggle installed in $toggle_dest"
fi

# Keys: add the repo's keys.json to the person's, section by section. A key
# they already bind to something else stays theirs and is reported.
if [ "$keys_step" = 1 ] && [ -f "$repo/keys.json" ]; then
  if command -v python3 >/dev/null 2>&1; then
    python3 - "$repo/keys.json" "$home/keys.json" <<'PY2'
import json, os, sys
src, dst = sys.argv[1], sys.argv[2]
with open(src, encoding="utf-8") as f: ours = json.load(f)
if not os.path.exists(dst):
    # Without a keys.json Herdr uses its defaults; writing one with only ours could drop them.
    print("keys: no %s yet, so none were added; open Herdr once, then run this again" % dst)
    sys.exit(0)
with open(dst, encoding="utf-8") as f: mine = json.load(f)
added, kept = [], []
for section, keys in ours.items():
    have = mine.setdefault(section, {})
    for key, action in keys.items():
        if key not in have: have[key] = action; added.append("%s %s" % (key, action))
        elif have[key] != action: kept.append("%s (yours: %s)" % (key, json.dumps(have[key])))
if added:
    with open(dst + ".reviewer-tmp", "w", encoding="utf-8") as f: json.dump(mine, f, indent=2, ensure_ascii=False); f.write("\n")
    os.replace(dst + ".reviewer-tmp", dst)
    print("keys: added " + ", ".join(added))
for k in kept: print("keys: left %s; bind the Reviewer action from keys.json to another key if you want it" % k)
PY2
  else
    echo "python3 isn't on PATH, so no keys were added; copy the ones in $repo/keys.json into $home/keys.json"
  fi
fi

[ "$layout_step" = 1 ] || exit 0
manual="In your layout, replace the \`changes\` block's mod with \`reviewer\` (see README, Install)."
shown=$(herdr-app status 2>/dev/null | sed -n 's/^ *"layout": *"\([^"]*\)".*/\1/p' | head -n 1) || shown=
if [ -z "$shown" ]; then
  echo "Herdr isn't open, so the layout was left alone. Run this again with Herdr open, or: $manual"
  exit 0
fi
file=$home/layouts/$shown.json
uses() { grep -q "\"mod\": *\"$2\"" "$1"; }
if [ ! -f "$file" ]; then
  echo "can't find the shown layout at $file. $manual"
  exit 0
fi
# Herdr's main layout caps the side panel at 900px, too narrow for a review;
# raise the max on every node holding the reviewer block to WIDE. It never
# lowers a max, and leaves the layout as it was without python3. 0.5.1 also
# gave the terminal area beside the panel "min": 480, but Herdr lets a panel
# run out of the window rather than shrink it below a sibling's min, so that
# min (exactly 480, on a sibling of those nodes) is taken out again.
WIDE=10000 OLD_KEEP=480
widen() {
  command -v python3 >/dev/null 2>&1 || { echo "python3 isn't on PATH, so the panel keeps its max width; raise \"max\" on the node holding reviewer in $1 by hand"; return 0; }
  python3 - "$1" "$WIDE" "$OLD_KEEP" <<'PY'
import json, os, sys
path, wide, old_keep = sys.argv[1], int(sys.argv[2]), int(sys.argv[3])
with open(path) as f: tree = json.load(f)
def holders(node, trail):
    if (node.get("content") or {}).get("mod") == "reviewer": return trail
    for child in node.get("children") or []:
        found = holders(child, trail + [child])
        if found is not None: return found
    return None
trail = [tree] + (holders(tree, []) or [])
raised, freed = [], []
for parent, n in zip(trail, trail[1:]):
    if isinstance(n.get("max"), (int, float)) and n["max"] < wide:
        raised.append("%s %s" % (n.get("id"), n["max"])); n["max"] = wide
    for sib in parent.get("children") or []:
        if sib is not n and sib not in trail and sib.get("min") == old_keep:
            del sib["min"]; freed.append(str(sib.get("id")))
if raised or freed:
    with open(path + ".reviewer-tmp", "w") as f: json.dump(tree, f, indent=2); f.write("\n")
    os.replace(path + ".reviewer-tmp", path)
if raised: print("layout: the panel holding reviewer can now be dragged wider (max %dpx; was %s)" % (wide, ", ".join(raised)))
if freed: print("layout: took out the %dpx min an earlier install gave %s, which pushed a wide panel out of the window" % (old_keep, ", ".join(freed)))
PY
}
if uses "$file" reviewer; then
  echo "layout $shown already shows reviewer"
  widen "$file"
  exit 0
fi
if ! uses "$file" changes; then
  echo "layout $shown has no \`changes\` block to swap. Add a block with \"mod\": \"reviewer\" where you want it."
  exit 0
fi
case "$shown" in
  main|terminals|win98)
    # Herdr's own layout: clone it (the clone keeps its look and clicks) and edit the clone.
    clone=$shown-reviewer
    if [ -f "$home/layouts/$clone.json" ]; then
      echo "layout $clone already exists; switch to it with: herdr-app do layout.switch '{\"name\":\"$clone\"}'"
      exit 0
    fi
    herdr-app do layout.clone "{\"name\":\"$shown\",\"as\":\"$clone\"}" >/dev/null
    file=$home/layouts/$clone.json
    i=0
    while [ ! -f "$file" ] && [ $i -lt 50 ]; do sleep 0.1; i=$((i + 1)); done
    [ -f "$file" ] || { echo "Herdr didn't write $file. $manual" >&2; exit 1; }
    shown=$clone
    ;;
esac
tmp=$file.reviewer-tmp
sed 's/"mod": *"changes"/"mod": "reviewer"/' "$file" > "$tmp" && mv "$tmp" "$file"
echo "layout $shown: the Changes panel now shows reviewer (the Changes button in the tab bar opens it)"
widen "$file"
