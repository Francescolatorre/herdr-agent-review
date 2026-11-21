// Tests for mods/reviewer/ask.js: the send dialog opens, and when it can't, the
// text goes straight to the space's agent. Run with `node --test` from the repo
// root. ask.js imports "herdr", which exists only inside the app, so its import
// is pointed at a stub the tests steer through globalThis.__t.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const b64 = (text) => "data:text/javascript;base64," + Buffer.from(text).toString("base64");
const stub = b64(`
  const t = () => globalThis.__t;
  export const agents = () => t().agents;
  export const focused = () => t().focused;
  export const hc = (args) => { t().hcCalls.push(args); return t().hc(args); };
  export const notify = (n) => { t().notes.push(n); };
  export const openOverlay = (o) => { t().overlays.push(o); if (t().overlayError) throw t().overlayError; };
  export const setShared = (k, v) => { t().shared[k] = v; };
  export const shared = (k) => t().shared[k];
`);
const file = fileURLToPath(new URL("../mods/reviewer/ask.js", import.meta.url));
const source = readFileSync(file, "utf8").replace('from "herdr"', `from "${stub}"`);
assert.ok(source.includes(stub), "the herdr import was replaced");
const { ask, pickAgent } = await import(b64(source));

const agent = (over) => ({ space: "s1", address: "t1", status: "idle", focused: false, tab_name: "claude", ...over });
beforeEach(() => {
  globalThis.__t = {
    agents: [agent()], focused: { space: "s1", cwd: "/repo" }, shared: {},
    hcCalls: [], notes: [], overlays: [], overlayError: null,
    hc: async () => ({ code: 0, stdout: "", stderr: "" }),
  };
});
const t = () => globalThis.__t;
const noDialog = () => { t().overlayError = new Error("no overlay"); };
const call = (extra = {}) => ask({ title: "Review · 1 comment", context: "the review text", sent: "k1", folder: "/repo", ...extra });

test("the dialog opens with the space and folder it came from", async () => {
  assert.equal(await call(), "dialog");
  assert.equal(t().overlays.length, 1);
  assert.equal(t().overlays[0].modal, true);
  assert.deepEqual(
    { ...t().overlays[0].props, title: undefined },
    { dialog: true, title: undefined, context: "the review text", sent: "k1", space: "s1", folder: "/repo" },
  );
  assert.equal(t().hcCalls.length, 0, "nothing is sent while the dialog is open");
});

test("the overlay failing sends the text straight to the space's agent", async () => {
  noDialog();
  assert.equal(await call(), "sent");
  assert.deepEqual(t().hcCalls, [["send", "--", "t1", "the review text"]]);
  assert.equal(t().notes.at(-1).level, "success");
  assert.match(t().notes.at(-1).title, /^Sent to claude$/);
});

test("a direct send tells the caller through reviewer.sent and keeps other entries", async () => {
  noDialog();
  t().shared["reviewer.sent"] = { earlier: 123 };
  await call();
  const sent = t().shared["reviewer.sent"];
  assert.equal(sent.earlier, 123);
  assert.equal(typeof sent.k1, "number", "a number is how the panel knows it was delivered");
});

test("without a sent key nothing is reported", async () => {
  noDialog();
  assert.equal(await call({ sent: undefined }), "sent");
  assert.equal("reviewer.sent" in t().shared, false);
});

test("the focused agent wins over an idle one, an idle one over the first", () => {
  const list = [agent({ address: "a", status: "done" }), agent({ address: "b", status: "idle" }), agent({ address: "c", status: "working", focused: true })];
  t().agents = list;
  assert.equal(pickAgent("s1").address, "c");
  list[2].focused = false;
  assert.equal(pickAgent("s1").address, "b");
  list[1].status = "done";
  assert.equal(pickAgent("s1").address, "a");
});

test("only agents of the same space are considered", async () => {
  noDialog();
  t().agents = [agent({ space: "other", address: "x" })];
  assert.equal(await call(), "none");
  assert.equal(t().hcCalls.length, 0);
  assert.equal(t().notes.at(-1).level, "warning");
  assert.match(t().notes.at(-1).title, /No agent in this space/);
});

test("a working or blocked agent gets nothing typed into it", async () => {
  noDialog();
  for (const status of ["working", "blocked"]) {
    t().agents = [agent({ status })];
    t().notes.length = 0;
    assert.equal(await call(), "none", status);
    assert.equal(t().hcCalls.length, 0, status);
    assert.equal(t().notes[0].level, "warning");
    assert.match(t().notes[0].title, new RegExp(status));
  }
  assert.equal("reviewer.sent" in t().shared, false, "so the drafts stay");
});

test("hc send failing keeps the drafts and says why", async () => {
  noDialog();
  t().hc = async () => ({ code: 1, stdout: "", stderr: "pane is gone" });
  assert.equal(await call(), "none");
  assert.equal(t().notes.at(-1).level, "error");
  assert.equal(t().notes.at(-1).body, "pane is gone");
  assert.equal("reviewer.sent" in t().shared, false);
});

test("hc itself throwing is handled the same way", async () => {
  noDialog();
  t().hc = async () => { throw new Error("hc not found"); };
  assert.equal(await call(), "none");
  assert.match(t().notes.at(-1).body, /hc not found/);
});

test("an empty message is not sent", async () => {
  noDialog();
  assert.equal(await call({ context: "  \n " }), "none");
  assert.equal(t().hcCalls.length, 0);
});

test("with no focused window there is no agent to pick", async () => {
  noDialog();
  t().focused = null;
  assert.equal(await call(), "none");
  assert.equal(t().hcCalls.length, 0);
});
