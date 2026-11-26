import assert from "node:assert/strict";
import test from "node:test";
import { normalizeList, listCommand, listRequests } from "../mods/reviewer/pr.js";

// The list of open pull / merge requests in the reviewer.pr dialog (logic in pr.js, exec stubbed).
function stub(handlers) {
  const calls = [];
  const exec = async (cmd, args, options) => {
    calls.push({ cmd, args, options });
    const line = `${cmd} ${args.join(" ")}`;
    for (const [pattern, result] of handlers) {
      if (pattern.test(line)) return typeof result === "function" ? result(line, options) : result;
    }
    return { code: 0, stdout: "", stderr: "" };
  };
  return { exec, calls };
}
const ok = (stdout = "") => ({ code: 0, stdout, stderr: "" });
const fail = (stderr, code = 1) => ({ code, stdout: "", stderr });

test("the list command: GitHub and GitLab, mine or all, with the repo named", () => {
  const gh = listCommand("github", { mine: true, path: "o/r", host: "github.com" });
  assert.equal(gh[0], "gh");
  assert.equal(gh[1].join(" "), "pr list --state open --limit 50 --repo o/r --json number,title,author,isDraft,headRefName,reviewDecision,updatedAt --search review-requested:@me");
  assert.ok(!listCommand("github", { mine: false, path: "o/r", host: "github.com" })[1].includes("--search"));
  assert.ok(listCommand("github", { mine: false, path: "o/r", host: "github.example.com" })[1].includes("github.example.com/o/r"));
  const gl = listCommand("gitlab", { mine: true, path: "g/s/p", host: "gitlab.corp.de" });
  assert.equal(gl[0], "glab");
  assert.equal(gl[1].join(" "), "mr list --per-page 50 --repo gitlab.corp.de/g/s/p --output json --reviewer=@me");
  assert.ok(!listCommand("gitlab", { mine: false, path: "g/p", host: "gitlab.com" })[1].some((a) => a.startsWith("--reviewer")));
});

test("gh and glab lists become rows; drafts and review status are recognised", () => {
  const gh = normalizeList("github", [
    { number: 3, title: "Add x", author: { login: "ann" }, isDraft: false, headRefName: "x", reviewDecision: "APPROVED", updatedAt: "2026-01-01" },
    { number: 4, title: "WIP", author: { login: "bob" }, isDraft: true, headRefName: "wip", reviewDecision: "", updatedAt: "" },
    { number: 5, title: "Fix", author: { login: "cy" }, isDraft: false, headRefName: "f", reviewDecision: "CHANGES_REQUESTED" },
    { title: "no number" },
  ]);
  assert.deepEqual(gh.map((r) => [r.number, r.author, r.branch, r.draft, r.review]), [[3, "ann", "x", false, "approved"], [4, "bob", "wip", true, null], [5, "cy", "f", false, "changes requested"]]);
  const gl = normalizeList("gitlab", [
    { iid: 7, title: "T", author: { username: "dee" }, source_branch: "t", draft: false, updated_at: "u" },
    { iid: 8, title: "Draft: later", author: { username: "eve" }, source_branch: "l" },
    { iid: 9, title: "Old style", author: { username: "fay" }, source_branch: "o", work_in_progress: true },
  ]);
  assert.deepEqual(gl.map((r) => [r.number, r.author, r.draft]), [[7, "dee", false], [8, "eve", true], [9, "fay", true]]);
  assert.deepEqual(normalizeList("github", null), []);
  assert.equal(normalizeList("github", Array.from({ length: 80 }, (_, i) => ({ number: i + 1, title: "t" }))).length, 50);
});

test("listRequests runs the command in the repo, on the space's machine, with a timeout", async () => {
  const row = { number: 12, title: "Fix", author: { login: "ann" }, isDraft: false, headRefName: "fix" };
  const { exec, calls } = stub([
    [/rev-parse --show-toplevel$/, ok("/w/proj\n")], [/config --get/, ok("git@github.com:o/r.git\n")], [/^gh pr list/, ok(JSON.stringify([row]))],
  ]);
  const result = await listRequests({ exec, cwd: "/w/proj/src", on: "box", mine: true });
  assert.equal(result.ok, true);
  assert.equal(result.items[0].number, 12);
  const list = calls.find((c) => c.cmd === "gh");
  assert.equal(list.options.cwd, "/w/proj");
  assert.equal(list.options.on, "box");
  assert.ok(list.options.timeout > 0);
  assert.ok(list.args.includes("review-requested:@me"));

  const gitlab = stub([[/rev-parse --show-toplevel$/, ok("/w/p\n")], [/config --get/, ok("https://gitlab.corp.de/g/p.git\n")], [/^glab mr list/, ok("[]")]]);
  const empty = await listRequests({ exec: gitlab.exec, cwd: "/w/p", mine: false });
  assert.deepEqual([empty.ok, empty.items], [true, []], "an empty list is a list, not an error");
  assert.ok(gitlab.calls.some((c) => c.cmd === "glab" && !c.args.some((a) => a.startsWith("--reviewer"))));
});

test("listRequests: no gh, no login, no access, junk output, no repo, no origin all give a clear problem", async () => {
  const base = [[/rev-parse --show-toplevel$/, ok("/w/p\n")], [/config --get/, ok("git@github.com:o/r.git\n")]];
  const run = (...extra) => listRequests({ exec: stub([...base, ...extra]).exec, cwd: "/w/p" });
  assert.match((await run([/^gh /, () => { throw new Error("spawn gh ENOENT"); }])).problem, /`gh` is not installed, so the list is empty/);
  assert.match((await run([/^gh /, fail("To get started with GitHub CLI, please run:  gh auth login", 4)])).problem, /not logged in .* the list is empty/);
  assert.match((await run([/^gh /, fail("GraphQL: Could not resolve to a Repository with the name 'o/r'.")])).problem, /project was not found/);
  assert.match((await run([/^gh /, fail("network is down")])).problem, /could not list the requests: network is down/);
  assert.match((await run([/^gh /, ok("<html>login</html>")])).problem, /unreadable/);
  assert.match((await listRequests({ exec: stub([[/rev-parse/, fail("fatal: not a git repository")]]).exec, cwd: "/tmp" })).problem, /not inside a Git repository/);
  assert.match((await listRequests({ exec: stub([[/rev-parse --show-toplevel$/, ok("/w/p\n")], [/config --get/, fail("")]]).exec, cwd: "/w/p" })).problem, /no `origin`/);
  assert.match((await listRequests({ exec: stub([]).exec, cwd: "" })).problem, /No folder/);
});
