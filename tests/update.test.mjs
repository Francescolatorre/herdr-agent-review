// Tests for mods/reviewer/update.js, the opt-in update hint. Run with `node --test`
// from the repo root. update.js imports "herdr", which exists only inside the app,
// so its import is pointed at a stub the tests steer through globalThis.__t.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const b64 = (text) => "data:text/javascript;base64," + Buffer.from(text).toString("base64");
const stub = b64(`
  const t = () => globalThis.__t;
  export const appHome = () => "/home/u/.config/herdr-app";
  export const readTextFile = async (path) => { t().reads.push(path); return t().modJson; };
  export const exec = async (cmd, args, options) => { t().execs.push({ cmd, args, options }); return t().exec(); };
  export const notify = (n) => { if (t().notifyThrows) throw new Error("no toast"); t().notes.push(n); };
  export const setShared = (k, v) => { t().shared[k] = v; };
  export const shared = (k) => t().shared[k];
`);
const file = fileURLToPath(new URL("../mods/reviewer/update.js", import.meta.url));
const source = readFileSync(file, "utf8").replace('from "herdr"', `from "${stub}"`);
assert.ok(source.includes(stub), "the herdr import was replaced");
const { newer, tagOf, checkForUpdate, REPO } = await import(b64(source));

const release = (tag) => ({ code: 0, stdout: JSON.stringify({ tag_name: tag, draft: false }), stderr: "" });
const NOW = 1_800_000_000_000, DAY = 24 * 60 * 60 * 1000;
beforeEach(() => {
  globalThis.__t = {
    shared: {}, reads: [], execs: [], notes: [],
    modJson: JSON.stringify({ place: "none", version: "0.1.0" }),
    exec: () => release("v0.2.0"),
  };
});
const t = () => globalThis.__t;
const check = (extra = {}) => checkForUpdate({ enabled: true, now: NOW, ...extra });

test("newer compares numbers, not text", () => {
  assert.equal(newer("0.10.0", "0.9.0"), true);
  assert.equal(newer("0.9.0", "0.10.0"), false);
  assert.equal(newer("1.0.0", "0.99.99"), true);
  assert.equal(newer("0.1.1", "0.1.0"), true);
});

test("newer is false for equal versions and ignores a v prefix and suffixes", () => {
  assert.equal(newer("0.1.0", "0.1.0"), false);
  assert.equal(newer("v0.2.0", "0.1.0"), true);
  assert.equal(newer("0.2.0-rc.1", "0.2.0"), false);
  assert.equal(newer("0.2.0+build5", "0.2.0"), false);
  assert.equal(newer("0.2", "0.1.9"), true, "a missing field counts as 0");
});

test("tagOf reads the tag and shrugs off anything else", () => {
  assert.equal(tagOf('{"tag_name":"v0.3.1","draft":false}'), "v0.3.1");
  assert.equal(tagOf('{"message":"Not Found"}'), null);
  assert.equal(tagOf("not json"), null);
  assert.equal(tagOf(""), null);
  assert.equal(tagOf('{"tag_name":""}'), null);
});

test("it does nothing unless it was asked to", async () => {
  for (const enabled of [undefined, false, "true", 1, null]) {
    assert.equal(await checkForUpdate({ enabled, now: NOW }), "off", String(enabled));
  }
  assert.equal(t().execs.length, 0);
  assert.equal(t().reads.length, 0);
  assert.deepEqual(t().shared, {});
});

test("a newer release posts one toast naming both versions and the page", async () => {
  assert.equal(await check(), "available");
  assert.equal(t().notes.length, 1);
  assert.equal(t().notes[0].level, "info");
  assert.match(t().notes[0].title, /0\.2\.0/);
  assert.match(t().notes[0].body, /You have 0\.1\.0/);
  assert.match(t().notes[0].body, new RegExp(`https://github.com/${REPO}/releases/tag/v0\\.2\\.0`));
});

test("it asks GitHub once, through curl, for that repo", async () => {
  await check({ repo: "someone/else" });
  assert.equal(t().execs.length, 1);
  assert.equal(t().execs[0].cmd, "curl");
  assert.equal(t().execs[0].args.at(-1), "https://api.github.com/repos/someone/else/releases/latest");
  assert.ok(t().execs[0].args.includes("--max-time"));
});

test("the request has a connect timeout and a total time", async () => {
  await check();
  const args = t().execs[0].args;
  assert.equal(args[args.indexOf("--connect-timeout") + 1], "5");
  assert.equal(args[args.indexOf("--max-time") + 1], "20");
  assert.ok(args.includes("-fsSL"));
});

test("it reads its own version from the installed mod.json", async () => {
  await check();
  assert.deepEqual(t().reads, ["/home/u/.config/herdr-app/mods/reviewer/mod.json"]);
});

test("the same version is current, with no toast", async () => {
  t().exec = () => release("v0.1.0");
  assert.equal(await check(), "current");
  assert.equal(t().notes.length, 0);
  assert.equal(t().shared["reviewer.update"].latest, "0.1.0");
});

test("an installed version ahead of the release is current too", async () => {
  t().modJson = JSON.stringify({ version: "0.8.1" });
  assert.equal(await check(), "current");
  assert.equal(t().notes.length, 0);
});

test("it looks at most once a day", async () => {
  await check();
  t().execs.length = 0;
  assert.equal(await check({ now: NOW + DAY - 1 }), "recent");
  assert.equal(t().execs.length, 0);
  assert.equal(await check({ now: NOW + DAY }), "available");
  assert.equal(t().execs.length, 1);
});

test("a release is announced once, a still newer one again", async () => {
  await check();
  assert.equal(t().notes.length, 1);
  assert.equal(await check({ now: NOW + DAY }), "available");
  assert.equal(t().notes.length, 1, "0.2.0 again: no second toast");
  t().exec = () => release("v0.3.0");
  assert.equal(await check({ now: NOW + 2 * DAY }), "available");
  assert.equal(t().notes.length, 2);
  assert.match(t().notes[1].title, /0\.3\.0/);
});

test("a failed look is silent and still counts as a look", async () => {
  t().exec = () => ({ code: 22, stdout: "", stderr: "curl: (22) The requested URL returned error: 403" });
  assert.equal(await check(), "failed");
  assert.equal(t().notes.length, 0);
  t().execs.length = 0;
  assert.equal(await check({ now: NOW + 1000 }), "recent", "not retried at once");
  assert.equal(t().execs.length, 0);
});

test("curl missing is handled like a failed look", async () => {
  t().exec = () => { throw new Error("no such program"); };
  assert.equal(await check(), "failed");
  assert.equal(t().notes.length, 0);
});

test("no published release is not an error", async () => {
  t().exec = () => ({ code: 0, stdout: '{"message":"Not Found"}', stderr: "" });
  assert.equal(await check(), "none");
  assert.equal(t().notes.length, 0);
});

test("without a readable mod.json it does not ask GitHub at all", async () => {
  t().modJson = null;
  assert.equal(await check(), "unknown");
  t().modJson = "{ broken";
  assert.equal(await check(), "unknown");
  t().modJson = JSON.stringify({ place: "none" });
  assert.equal(await check(), "unknown");
  assert.equal(t().execs.length, 0);
});

// A firewall, a VPN or a proxy must never make this noisy or break the panel.
test("a login page instead of JSON is not an error", async () => {
  t().exec = () => ({ code: 0, stdout: "<html>Please log in to the guest network</html>", stderr: "" });
  assert.equal(await check(), "none");
  assert.equal(t().notes.length, 0);
});

test("an exec result with no output, or none at all, does not throw", async () => {
  t().exec = () => ({ code: 0 });
  assert.equal(await check(), "none");
  t().shared = {};
  t().exec = () => undefined;
  assert.equal(await check(), "failed");
  assert.equal(t().notes.length, 0);
});

test("a timeout from exec is a failed look", async () => {
  t().exec = () => Promise.reject(new Error("timed out after 30000 ms"));
  assert.equal(await check(), "failed");
  assert.equal(t().notes.length, 0);
});

test("it never rejects, whatever throws underneath", async () => {
  t().exec = () => release("v0.2.0");
  t().notifyThrows = true;
  await assert.doesNotReject(check());
  t().notifyThrows = false;
  t().shared = {};
  Object.defineProperty(t().shared, "reviewer.update", { get() { throw new Error("shared is broken"); } });
  await assert.doesNotReject(check());
  assert.equal(await check(), "failed");
});
