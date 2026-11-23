import assert from "node:assert/strict";
import { test } from "node:test";
import { createLogger } from "../mods/reviewer/diagnostics.js";

test("concurrent writers preserve entries, bound retention and exclude raw error text", async () => {
  let file = Array.from({ length: 200 }, (_, i) => JSON.stringify({ seq: i })).join("\n") + "\n";
  const host = {
    appHome: () => "/local", checking: () => false, window: () => ({ platform: "linux" }),
    readTextFile: async () => file,
    writeTextFile: async (path, next, previous) => {
      assert.equal(path, "/local/reviewer.log");
      if (previous !== file) throw Error("Stale");
      file = next;
    }
  };
  await Promise.all([createLogger(host)("agent.send", "permission denied: PRIVATE REVIEW", 9),
    createLogger(host)("preview", Error("/private/file not found"))]);
  const rows = file.trimEnd().split("\n").map(JSON.parse);
  assert.equal(rows.length, 200);
  assert.equal(rows[0].seq, 2);
  assert.equal(rows.at(-2).reason, "permission-denied");
  assert.equal(rows.at(-2).exit, 9);
  assert.equal(rows.at(-1).reason, "not-found");
  assert.doesNotMatch(file, /PRIVATE REVIEW|private\/file/);
});
