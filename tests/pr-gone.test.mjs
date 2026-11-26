import assert from "node:assert/strict";
import test from "node:test";
import { probePin, forgetWorktree } from "../mods/reviewer/pr.js";
import { createPins, KEY } from "../mods/reviewer/pins.js";

// A pinned worktree that was deleted outside Reviewer: the panel must notice, let go of the
// request and follow its pane, instead of running git in a folder that is not there.
const pin = { label: "MR !894", repo: "/w/repo", root: "/w/.reviewer-worktrees/repo/mr-894", ref: "refs/reviewer/mr/894", on: null, space: "s1" };

test("a worktree that is gone is noticed, whether git reports it or exec throws", async () => {
  const missing = await probePin({ exec: async () => ({ code: 128, stdout: "", stderr: "fatal: cannot change to '/w/.reviewer-worktrees/repo/mr-894': No such file or directory" }), pin });
  assert.equal(missing.gone, true);
  const thrown = await probePin({ exec: async () => { throw new Error("cannot change to ..."); }, pin });
  assert.equal(thrown.gone, true, "a throwing exec is a gone worktree, not an unhandled error");
  assert.equal((await probePin({ exec: async () => ({ code: 0, stdout: "\n", stderr: "" }), pin })).gone, true, "no top level is no worktree");
});

test("a worktree that is there is not gone, and its result is handed on", async () => {
  const calls = [];
  const exec = async (cmd, args, options) => { calls.push({ cmd, args, options }); return { code: 0, stdout: `${pin.root}\n`, stderr: "" }; };
  const probe = await probePin({ exec, pin: { ...pin, on: "box" }, args: ["--no-optional-locks", "rev-parse", "--show-toplevel"] });
  assert.equal(probe.gone, false);
  assert.equal(probe.result.stdout.trim(), pin.root);
  assert.deepEqual(calls[0], { cmd: "git", args: ["--no-optional-locks", "rev-parse", "--show-toplevel"], options: { cwd: pin.root, on: "box" } });
});

test("a pin whose root is gone is dropped from its space and the origin repo forgets the worktree", async () => {
  const state = { [KEY]: { s1: pin, s2: { ...pin, root: "/other", space: "s2" } } };
  const pins = createPins({ get: (k) => state[k], set: (k, v) => { state[k] = v; }, spaces: () => ["s1", "s2"], active: () => "s1" });
  const calls = [];
  const exec = async (cmd, args, options) => {
    calls.push({ args: args.join(" "), cwd: options.cwd });
    return args[0] === "rev-parse" ? { code: 128, stdout: "", stderr: "fatal: cannot change to" } : { code: 0, stdout: "", stderr: "" };
  };
  const probe = await probePin({ exec, pin: pins.pinned("s1") });
  assert.equal(probe.gone, true);
  pins.set(pin.space, null);
  await forgetWorktree({ exec, pin });
  assert.equal(pins.pinned("s1"), null, "the panel follows its pane again");
  assert.equal(pins.pinned("s2").root, "/other", "another space's request is untouched");
  assert.deepEqual(calls.slice(1), [{ args: "worktree prune", cwd: "/w/repo" }, { args: "update-ref -d refs/reviewer/mr/894", cwd: "/w/repo" }]);
});

test("forgetting never throws, even when git is not there at all", async () => {
  await assert.doesNotReject(forgetWorktree({ exec: async () => { throw new Error("spawn git ENOENT"); }, pin }));
  await assert.doesNotReject(forgetWorktree({ exec: async () => ({ code: 1, stdout: "", stderr: "boom" }), pin: { ...pin, ref: undefined } }));
});
