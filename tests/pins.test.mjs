import assert from "node:assert/strict";
import test from "node:test";
import { createPins, KEY } from "../mods/reviewer/pins.js";

function store(initial, { spaces = ["s1", "s2"], active = "s1" } = {}) {
  const state = { shared: initial === undefined ? {} : { [KEY]: initial }, writes: [], active, spaces };
  const pins = createPins({
    get: (k) => state.shared[k],
    set: (k, v) => { state.writes.push(k); state.shared[k] = v; },
    spaces: () => state.spaces,
    active: () => state.active,
  });
  return { pins, state };
}
const pin = (root, extra = {}) => ({ root, label: "MR !894", path: root, repo: "/w/repo", ref: "refs/reviewer/mr/894", ...extra });

test("a request belongs to the space it was opened in", () => {
  const { pins, state } = store();
  pins.set("s1", pin("/w/.reviewer-worktrees/repo/mr-894"));
  assert.equal(pins.pinned("s1").root, "/w/.reviewer-worktrees/repo/mr-894");
  assert.equal(pins.pinned("s1").space, "s1");
  assert.equal(pins.pinned("s2"), null, "another space follows its pane");
  assert.equal(pins.pinned(null), null);
  assert.equal(pins.pinned(), pins.pinned("s1"), "the default is the active space");
  state.active = "s2";
  assert.equal(pins.pinned(), null);
});

test("each space has its own request", () => {
  const { pins } = store();
  pins.set("s1", pin("/a"));
  pins.set("s2", pin("/b"));
  assert.equal(pins.pinned("s1").root, "/a");
  assert.equal(pins.pinned("s2").root, "/b");
  pins.set("s1", null);
  assert.equal(pins.pinned("s1"), null);
  assert.equal(pins.pinned("s2").root, "/b", "releasing one leaves the other");
});

test("an old single request, kept for every space, is ignored and then dropped", () => {
  const old = pin("/w/.reviewer-worktrees/proposal-generator/mr-894"); // the first version: one pin, top-level root
  const { pins, state } = store(old);
  assert.equal(pins.pinned("s1"), null);
  assert.equal(pins.pinned("s2"), null);
  assert.equal(pins.pinned(), null);
  assert.equal(pins.hasLegacy(), true);
  pins.dropLegacy();
  assert.equal(state.shared[KEY], null);
  assert.equal(pins.hasLegacy(), false);
  pins.dropLegacy();
  assert.deepEqual(state.writes, [KEY], "nothing is written when there is nothing old");

  const again = store(old);
  again.pins.set("s1", pin("/new"));
  assert.deepEqual(Object.keys(again.state.shared[KEY]), ["s1"], "a new request replaces the old format");
});

test("letting go touches the shared key only, never a worktree", () => {
  const { pins, state } = store();
  pins.set("s1", pin("/a"));
  state.writes.length = 0;
  pins.set("s1", null);
  assert.deepEqual(state.writes, [KEY]);
  assert.equal(state.shared[KEY], null, "the key goes when no space has a request");
  // Opening it again later (from the list) sets a fresh pin for the same worktree.
  pins.set("s1", pin("/a"));
  assert.equal(pins.pinned("s1").root, "/a");
});

test("requests of spaces that no longer exist are dropped on the next change", () => {
  const { pins, state } = store();
  pins.set("s1", pin("/a"));
  pins.set("s2", pin("/b"));
  state.spaces = ["s2", "s3"];
  pins.set("s3", pin("/c"));
  assert.deepEqual(Object.keys(state.shared[KEY]).sort(), ["s2", "s3"]);
  state.spaces = [];
  pins.set("s4", pin("/d"));
  assert.ok(state.shared[KEY].s2 && state.shared[KEY].s4, "with no list of spaces nothing is pruned");
});

test("garbage in the shared key is no request", () => {
  for (const junk of [null, undefined, 5, "x", [], [pin("/a")], { s1: null }, { s1: { root: 3 } }, { s1: "x" }]) {
    const { pins } = store(junk);
    assert.equal(pins.pinned("s1"), null, JSON.stringify(junk));
  }
});
