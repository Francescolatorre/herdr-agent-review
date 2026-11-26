import assert from "node:assert/strict";
import test from "node:test";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parseRemote, providerOf, parseTarget, resolveTarget, refFor, worktreePath, normalizeInfo, cliProblem, openReview, closeReview, repoOf,
} from "../mods/reviewer/pr.js";

test("remote URLs of every common shape give host and path", () => {
  for (const url of ["https://github.com/o/r.git", "git@github.com:o/r.git", "ssh://git@github.com/o/r", "https://user:x@github.com/o/r/"]) {
    assert.deepEqual(parseRemote(url), { host: "github.com", path: "o/r" }, url);
  }
  assert.deepEqual(parseRemote("ssh://git@git.corp.de:2222/group/sub/proj.git"), { host: "git.corp.de", path: "group/sub/proj" });
  assert.deepEqual(parseRemote("git@gitlab.corp.de:group/sub/proj.git"), { host: "gitlab.corp.de", path: "group/sub/proj" });
  assert.equal(parseRemote("not a url"), null);
});

test("github.* hosts are GitHub, any other host is GitLab", () => {
  assert.equal(providerOf("github.com"), "github");
  assert.equal(providerOf("github.example.com"), "github");
  assert.equal(providerOf("gitlab.com"), "gitlab");
  assert.equal(providerOf("git.corp.de"), "gitlab");
});

test("links and numbers are parsed", () => {
  assert.deepEqual(parseTarget("https://github.com/o/r/pull/12"), { provider: "github", number: 12, host: "github.com", path: "o/r" });
  assert.deepEqual(parseTarget("https://github.com/o/r/pull/12/files#diff"), { provider: "github", number: 12, host: "github.com", path: "o/r" });
  assert.deepEqual(parseTarget("https://gitlab.corp.de/g/s/p/-/merge_requests/7"), { provider: "gitlab", number: 7, host: "gitlab.corp.de", path: "g/s/p" });
  assert.deepEqual(parseTarget("https://gitlab.corp.de/g/p/merge_requests/7?x=1"), { provider: "gitlab", number: 7, host: "gitlab.corp.de", path: "g/p" });
  assert.equal(parseTarget("42").number, 42);
  assert.equal(parseTarget("#42").provider, null);
  assert.equal(parseTarget("!42").provider, "gitlab");
  for (const bad of ["", "  ", "abc", "https://github.com/o/r", "12abc"]) assert.ok(parseTarget(bad).error, bad);
});

test("a bare number takes the provider of origin; a link for another project is refused", () => {
  assert.equal(resolveTarget("5", "git@github.com:o/r.git").provider, "github");
  assert.equal(resolveTarget("5", "git@gitlab.corp.de:g/p.git").provider, "gitlab");
  assert.equal(resolveTarget("https://github.com/O/R/pull/5", "git@github.com:o/r.git").number, 5);
  assert.match(resolveTarget("https://github.com/x/y/pull/5", "git@github.com:o/r.git").error, /origin is github\.com\/o\/r/);
  assert.match(resolveTarget("!5", "git@github.com:o/r.git").error, /GitLab/);
  assert.equal(resolveTarget("5", "/srv/git/origin.git").provider, "github", "a local-path origin still takes a number");
  assert.equal(resolveTarget("!5", "C:/git/origin.git").provider, "gitlab");
  assert.match(resolveTarget("https://github.com/o/r/pull/5", "/srv/git/origin.git").error, /Cannot read the origin/);
});

test("ref names and the worktree path", () => {
  assert.deepEqual(refFor("github", 3), { remote: "pull/3/head", local: "refs/reviewer/pr/3" });
  assert.deepEqual(refFor("gitlab", 3), { remote: "merge-requests/3/head", local: "refs/reviewer/mr/3" });
  assert.equal(worktreePath("C:\\dev\\proj", "github", 3), "C:/dev/.reviewer-worktrees/proj/pr-3");
  assert.equal(worktreePath("/home/u/proj/", "gitlab", 9), "/home/u/.reviewer-worktrees/proj/mr-9");
  assert.equal(worktreePath("/srv/git/proj.git", "github", 1), "/srv/git/.reviewer-worktrees/proj/pr-1");
});

test("gh and glab output become one shape", () => {
  const gh = normalizeInfo("github", {
    title: "Fix", body: "Why", author: { login: "ann" }, labels: [{ name: "bug" }], baseRefName: "main", headRefName: "fix", state: "OPEN", url: "u",
    statusCheckRollup: [{ conclusion: "SUCCESS", status: "COMPLETED" }, { conclusion: "FAILURE", status: "COMPLETED" }, { status: "IN_PROGRESS", conclusion: "" }],
  });
  assert.deepEqual(gh, { title: "Fix", body: "Why", author: "ann", labels: ["bug"], base: "main", head: "fix", state: "open", url: "u", checks: "1 passed, 1 failed, 1 pending", source: "gh" });
  const gl = normalizeInfo("gitlab", { title: "T", description: "D", author: { username: "bob" }, labels: ["a"], target_branch: "dev", source_branch: "f", state: "opened", web_url: "w", head_pipeline: { status: "running" } });
  assert.deepEqual(gl, { title: "T", body: "D", author: "bob", labels: ["a"], base: "dev", head: "f", state: "opened", url: "w", checks: "pipeline running", source: "glab" });
  assert.equal(normalizeInfo("github", {}).checks, null);
});

test("problems with gh and glab are told in words", () => {
  assert.match(cliProblem("gh", 1, { code: 127, stderr: "" }), /not installed/);
  assert.match(cliProblem("gh", 1, { code: 1, stderr: "'gh' is not recognized as an internal or external command" }), /not installed/);
  assert.match(cliProblem("gh", 1, { code: 4, stderr: "To get started with GitHub CLI, please run:  gh auth login" }), /not logged in/);
  assert.match(cliProblem("glab", 1, { code: 1, stderr: "401 Unauthorized" }), /not logged in/);
  assert.match(cliProblem("gh", 9, { code: 1, stderr: "GraphQL: Could not resolve to a PullRequest with the number of 9." }), /#9 was not found/);
  assert.match(cliProblem("gh", 1, { code: 1, stderr: "boom\nmore" }), /boom/);
});

// ---- with a stub: the commands that run, and what goes wrong -------------------

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

test("openReview for GitHub: the commands, the pin, the description", async () => {
  const gh = { title: "Fix", body: "Why", author: { login: "ann" }, labels: [], baseRefName: "develop", headRefName: "fix", state: "OPEN", statusCheckRollup: [] };
  const { exec, calls } = stub([
    [/rev-parse --show-toplevel$/, (l, o) => ok(o.cwd === "/w/.reviewer-worktrees/proj/pr-12" ? "/w/.reviewer-worktrees/proj/pr-12\n" : "/w/proj\n")],
    [/config --get remote.origin.url/, ok("git@github.com:o/r.git\n")],
    [/^gh pr view/, ok(JSON.stringify(gh))],
    [/worktree list/, ok("worktree /w/proj\n")],
    [/rev-parse --short HEAD/, ok("abc1234\n")],
  ]);
  const result = await openReview({ exec, cwd: "/w/proj/src", on: "box", input: "https://github.com/o/r/pull/12" });
  assert.equal(result.ok, true, result.error);
  const { pin } = result;
  assert.equal(pin.label, "PR #12");
  assert.equal(pin.base, "develop");
  assert.equal(pin.root, "/w/.reviewer-worktrees/proj/pr-12");
  assert.equal(pin.on, "box");
  assert.equal(pin.info.title, "Fix");
  assert.deepEqual(pin.notes, []);
  const lines = calls.map((c) => `${c.cmd} ${c.args.join(" ")}`);
  assert.ok(lines.includes("git fetch --no-tags origin +pull/12/head:refs/reviewer/pr/12"));
  assert.ok(lines.includes("git fetch --no-tags origin +refs/heads/develop:refs/remotes/origin/develop"));
  assert.ok(lines.includes("git worktree add --detach /w/.reviewer-worktrees/proj/pr-12 refs/reviewer/pr/12"));
  assert.ok(lines.some((l) => l.startsWith("gh pr view 12 --repo o/r --json")));
  assert.ok(calls.every((c) => c.options.on === "box"), "every command runs on the machine of the space");
  assert.ok(!lines.some((l) => /push|checkout|reset/.test(l)), "the person's checkout is not touched");
});

test("openReview for GitLab asks glab and fetches the merge request ref", async () => {
  const { exec, calls } = stub([
    [/rev-parse --show-toplevel$/, ok("/w/proj\n")],
    [/config --get remote.origin.url/, ok("https://gitlab.corp.de/g/s/p.git\n")],
    [/^glab mr view/, ok(JSON.stringify({ title: "T", description: "D", target_branch: "dev" }))],
    [/worktree list/, ok("")],
  ]);
  const result = await openReview({ exec, cwd: "/w/proj", input: "!7" });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.pin.label, "MR !7");
  assert.equal(result.pin.base, "dev");
  const lines = calls.map((c) => `${c.cmd} ${c.args.join(" ")}`);
  assert.ok(lines.includes("glab mr view 7 --repo gitlab.corp.de/g/s/p --output json"));
  assert.ok(lines.includes("git fetch --no-tags origin +merge-requests/7/head:refs/reviewer/mr/7"));
});

test("without gh the code still opens, on origin's default branch, and the note says why", async () => {
  const { exec } = stub([
    [/rev-parse --show-toplevel$/, ok("/w/proj\n")],
    [/config --get remote.origin.url/, ok("git@github.com:o/r.git\n")],
    [/^gh /, () => { throw new Error("spawn gh ENOENT"); }],
    [/symbolic-ref/, ok("refs/remotes/origin/trunk\n")],
    [/worktree list/, ok("")],
  ]);
  const result = await openReview({ exec, cwd: "/w/proj", input: "3" });
  assert.equal(result.ok, true, result.error);
  assert.equal(result.pin.info, null);
  assert.equal(result.pin.base, "trunk");
  assert.match(result.pin.notes.join("\n"), /`gh` is not installed/);
  assert.match(result.pin.notes.join("\n"), /target branch is not known/);
});

test("error paths: no repo, no origin, wrong link, fetch refused, worktree refused", async () => {
  const none = stub([[/rev-parse/, fail("fatal: not a git repository")]]);
  assert.match((await openReview({ exec: none.exec, cwd: "/tmp/x", input: "1" })).error, /not inside a Git repository/);

  const noOrigin = stub([[/rev-parse --show-toplevel$/, ok("/w/p\n")], [/config --get/, fail("", 1)]]);
  assert.match((await openReview({ exec: noOrigin.exec, cwd: "/w/p", input: "1" })).error, /no `origin` remote/);

  const base = [[/rev-parse --show-toplevel$/, ok("/w/p\n")], [/config --get/, ok("git@github.com:o/r.git\n")], [/^gh /, fail("Could not resolve to a PullRequest")]];
  const wrong = stub(base);
  assert.match((await openReview({ exec: wrong.exec, cwd: "/w/p", input: "https://github.com/x/y/pull/1" })).error, /origin is github\.com\/o\/r/);
  assert.equal(wrong.calls.some((c) => c.args[0] === "fetch"), false, "nothing is fetched for a link to another project");

  const refused = stub([...base, [/^git fetch .*pull/, fail("fatal: couldn't find remote ref pull/99/head")]]);
  assert.match((await openReview({ exec: refused.exec, cwd: "/w/p", input: "99" })).error, /Could not fetch pull\/99\/head from origin: couldn't find remote ref/);

  const worktree = stub([...base, [/worktree list/, ok("")], [/worktree add/, fail("fatal: '/x' already exists")]]);
  assert.match((await openReview({ exec: worktree.exec, cwd: "/w/p", input: "1" })).error, /Could not create the worktree .*already exists/);
});

test("an existing worktree is moved to the new head, or left alone when it has changes", async () => {
  const listed = "worktree /w/p\n\nworktree /w/.reviewer-worktrees/p/pr-1\n";
  const handlers = (status) => [
    [/rev-parse --show-toplevel$/, (l, o) => ok(o.cwd.includes("reviewer-worktrees") ? "/w/.reviewer-worktrees/p/pr-1\n" : "/w/p\n")],
    [/config --get/, ok("git@github.com:o/r.git\n")], [/^gh /, fail("x", 127)],
    [/worktree list/, ok(listed)], [/status --porcelain/, ok(status)],
  ];
  const clean = stub(handlers(""));
  const a = await openReview({ exec: clean.exec, cwd: "/w/p", input: "1" });
  assert.equal(a.ok, true);
  assert.ok(clean.calls.some((c) => c.args.join(" ") === "checkout --detach refs/reviewer/pr/1" && c.options.cwd === "/w/.reviewer-worktrees/p/pr-1"));
  assert.equal(clean.calls.some((c) => c.args[1] === "add"), false);

  const dirty = stub(handlers(" M file.js\n"));
  const b = await openReview({ exec: dirty.exec, cwd: "/w/p", input: "1" });
  assert.equal(b.ok, true);
  assert.match(b.pin.notes.join("\n"), /local changes/);
  assert.equal(dirty.calls.some((c) => c.args[0] === "checkout"), false);
});

test("closeReview refuses a dirty worktree until forced, then removes worktree and ref", async () => {
  const pin = { repo: "/w/p", path: "/w/.reviewer-worktrees/p/pr-1", ref: "refs/reviewer/pr/1", on: null };
  const { exec, calls } = stub([[/worktree list/, ok("worktree /w/p\n\nworktree /w/.reviewer-worktrees/p/pr-1\n")], [/status --porcelain/, ok(" M a\n")]]);
  const first = await closeReview({ exec, pin });
  assert.equal(first.ok, false);
  assert.equal(first.dirty, true);
  assert.equal(calls.some((c) => c.args[0] === "worktree" && c.args[1] === "remove"), false);
  const forced = await closeReview({ exec, pin, force: true });
  assert.equal(forced.ok, true);
  const lines = calls.map((c) => c.args.join(" "));
  assert.ok(lines.includes("worktree remove --force /w/.reviewer-worktrees/p/pr-1"));
  assert.ok(lines.includes("update-ref -d refs/reviewer/pr/1"));
});

test("closeReview still cleans up when the worktree folder is already gone", async () => {
  const pin = { repo: "/w/p", path: "/w/.reviewer-worktrees/p/pr-1", ref: "refs/reviewer/pr/1" };
  const { exec, calls } = stub([[/worktree list/, ok("worktree /w/p\n")]]);
  assert.equal((await closeReview({ exec, pin })).ok, true);
  assert.ok(calls.some((c) => c.args.join(" ") === "update-ref -d refs/reviewer/pr/1"));
});

// ---- with real Git: a pull request on a local "host" -----------------------------

const git = (cwd, ...args) => {
  const r = spawnSync("git", ["-c", "user.name=t", "-c", "user.email=t@example.com", "-c", "commit.gpgsign=false", ...args], { cwd, encoding: "utf8" });
  assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`);
  return r.stdout.trim();
};
const realExec = async (cmd, args, options) => {
  if (cmd !== "git") return { code: 127, stdout: "", stderr: `${cmd}: command not found` };
  const r = spawnSync(cmd, args, { cwd: options?.cwd, encoding: "utf8" });
  return { code: r.status ?? 1, stdout: r.stdout ?? "", stderr: r.stderr ?? "" };
};

test("a real pull request: worktree at its head, diff against its own merge base, then closed", async (t) => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "reviewer-pr-")));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const origin = join(home, "origin.git"), work = join(home, "work"), clone = join(home, "clone");
  git(home, "init", "--bare", "-b", "main", origin);
  git(home, "clone", origin, work);
  writeFileSync(join(work, "a.txt"), "one\n");
  git(work, "add", "."); git(work, "commit", "-m", "base"); git(work, "push", "origin", "HEAD:main");
  // The pull request: two commits on a branch, published as pull/1/head like GitHub does.
  git(work, "switch", "-c", "feature");
  writeFileSync(join(work, "a.txt"), "one\ntwo\n"); git(work, "commit", "-am", "pr one");
  writeFileSync(join(work, "b.txt"), "new\n"); git(work, "add", "."); git(work, "commit", "-m", "pr two");
  git(work, "push", "origin", "HEAD:refs/pull/1/head");
  // Main moves on after the request was opened.
  git(work, "switch", "main");
  writeFileSync(join(work, "c.txt"), "later\n"); git(work, "add", "."); git(work, "commit", "-m", "main moves"); git(work, "push", "origin", "main");
  git(home, "clone", origin, clone);
  const before = git(clone, "status", "--porcelain=v1", "--branch");

  const result = await openReview({ exec: realExec, cwd: clone, input: "1" });
  assert.equal(result.ok, true, result.error);
  const { pin } = result;
  assert.equal(pin.base, "main");
  assert.ok(pin.root.endsWith("/.reviewer-worktrees/clone/pr-1"), pin.root); // Git may spell the temp folder in its long form
  assert.ok(existsSync(join(pin.path, "b.txt")), "the request's files are checked out");
  assert.equal(readFileSync(join(pin.path, "a.txt"), "utf8").replace(/\r/g, ""), "one\ntwo\n");
  assert.equal(git(clone, "status", "--porcelain=v1", "--branch"), before, "the person's checkout is as it was");
  assert.equal(git(pin.path, "rev-parse", "--abbrev-ref", "HEAD"), "HEAD", "detached");
  // What the panel's "vs main" scope shows: the diff from the merge base, not from where main is now.
  const mergeBase = git(pin.path, "merge-base", "origin/main", "HEAD");
  assert.deepEqual(git(pin.path, "diff", mergeBase, "--name-only").split(/\r?\n/).sort(), ["a.txt", "b.txt"]);
  assert.equal(git(pin.path, "log", "--first-parent", "--format=%s", `${mergeBase}..HEAD`).split(/\r?\n/).join("|"), "pr two|pr one");
  assert.match(pin.notes.join("\n"), /`gh` is not installed/);

  // Opening it again reuses the worktree (and picks up a new head).
  const again = await openReview({ exec: realExec, cwd: clone, input: "1" });
  assert.equal(again.ok, true, again.error);
  assert.equal(again.pin.root, pin.root);
  assert.equal((await repoOf(realExec, pin.path)).root, pin.root);

  writeFileSync(join(pin.path, "notes.txt"), "mine\n");
  const refused = await closeReview({ exec: realExec, pin });
  assert.equal(refused.dirty, true);
  assert.ok(existsSync(pin.path));
  const closed = await closeReview({ exec: realExec, pin, force: true });
  assert.equal(closed.ok, true, closed.error);
  assert.equal(existsSync(pin.path), false);
  assert.equal(spawnSync("git", ["rev-parse", "--verify", "-q", pin.ref], { cwd: clone }).status, 1, "the local ref is gone");
});

test("a pull request that does not exist says so", async (t) => {
  const home = realpathSync(mkdtempSync(join(tmpdir(), "reviewer-pr-")));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const origin = join(home, "origin.git"), clone = join(home, "clone");
  git(home, "init", "--bare", "-b", "main", origin);
  git(home, "clone", origin, clone);
  const result = await openReview({ exec: realExec, cwd: clone, input: "77" });
  assert.equal(result.ok, false);
  assert.match(result.error, /Could not fetch pull\/77\/head from origin/);
});
