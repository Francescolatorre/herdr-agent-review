// Which pull / merge request each space has open, kept in shared "reviewer.pr" as a map
// { <space id>: pin }. A pin belongs to the space it was opened in: only that space's panel
// follows the request's worktree, every other space follows its pane as usual.
//
// Shared state survives restarts, so an older format needs care: the first version kept ONE pin
// (an object with a top-level `root`) for every space at once. Such a pin has no space it
// belongs to, so it is ignored, and dropped by `dropLegacy()` / the next write.
//
// Plain logic over injected accessors (`get`/`set` of the shared key, the open space ids, the
// active space id), so the tests drive it without Herdr.
export const KEY = "reviewer.pr";

const valid = (p) => Boolean(p) && typeof p === "object" && typeof p.root === "string";

export function createPins({ get, set, spaces = () => [], active = () => null }) {
  const raw = () => get(KEY);
  const isLegacy = (v) => valid(v);
  const all = () => { const v = raw(); return v && typeof v === "object" && !Array.isArray(v) && !isLegacy(v) ? v : {}; };
  const id = (space) => String(space ?? "");
  return {
    // The pin of `space` (default: the active space), or null.
    pinned(space = active()) {
      const p = all()[id(space)];
      return valid(p) ? p : null;
    },
    // Opens (`pin`) or releases (null) the space's pin. A release leaves the worktree alone.
    // Pins of spaces that no longer exist are dropped on the way.
    set(space, pin) {
      const map = { ...all() }, key = id(space);
      if (pin) map[key] = { ...pin, space: key }; else delete map[key];
      const open = spaces();
      if (open.length) for (const k of Object.keys(map)) if (k !== key && !open.includes(k)) delete map[k];
      set(KEY, Object.keys(map).length ? map : null);
    },
    // A single pin from the first version: nobody owns it.
    hasLegacy: () => isLegacy(raw()),
    dropLegacy() { if (isLegacy(raw())) set(KEY, null); },
  };
}
