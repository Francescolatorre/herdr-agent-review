// Reviewing a whole pull request (GitHub) or merge request (GitLab).
//
// Everything here is plain logic around an injected `exec(cmd, args, options)`
// (Herdr's, in the app), so the tests drive it with a stub. Nothing here
// touches the person's own checkout: the request's head is fetched into a ref
// of its own (refs/reviewer/pr/N or refs/reviewer/mr/N) and checked out
// detached in a separate worktree, `<parent of the repo>/.reviewer-worktrees/<repo>/pr-N`.
// The panel then reviews that worktree against the request's target branch.
// The description comes from `gh` or `glab` when they are installed and logged in;
// without them the review still works and says what is missing.
//
// Read-only towards the host: nothing is pushed, commented or approved.

const MAX_BODY = 40000;

// ---- what the person typed ---------------------------------------------------

// "host/group/project" from a remote URL (https, ssh://, scp-like git@host:path).
export function parseRemote(url) {
  const text = String(url ?? "").trim();
  let m = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]+@)?([^/:]+)(?::\d+)?\/(.+?)(?:\.git)?\/?$/i.exec(text);
  if (!m) m = /^(?:[^@/\s]+@)?([^:/\s]{2,}):(?!\/\/)(.+?)(?:\.git)?\/?$/.exec(text);
  return m ? { host: m[1].toLowerCase(), path: m[2].replace(/^\/+/, "") } : null;
}

// github.com, and GitHub Enterprise hosts named github.*, are GitHub; any other host is GitLab
// (gitlab.com or a self-hosted one). A link or `!N` is explicit and wins over the host.
export function providerOf(host) {
  return /^github(\.|$)/i.test(String(host)) ? "github" : "gitlab";
}

// A link to a request, or a number (`12`, `#12`, `!12`). Returns
// { provider, number, host, path } (provider/host/path null for a bare number
// without a hint) or { error }.
export function parseTarget(input) {
  const text = String(input ?? "").trim();
  if (!text) return { error: "Enter a pull or merge request link or number." };
  let m = /^https?:\/\/([^/\s]+)\/(.+?)\/pull\/(\d+)(?:[/?#].*)?$/i.exec(text);
  if (m) return { provider: "github", number: Number(m[3]), host: m[1].toLowerCase(), path: m[2] };
  m = /^https?:\/\/([^/\s]+)\/(.+?)\/(?:-\/)?merge_requests\/(\d+)(?:[/?#].*)?$/i.exec(text);
  if (m) return { provider: "gitlab", number: Number(m[3]), host: m[1].toLowerCase(), path: m[2] };
  m = /^([#!]?)(\d+)$/.exec(text);
  if (m) return { provider: m[1] === "!" ? "gitlab" : null, number: Number(m[2]), host: null, path: null };
  return { error: `"${text.slice(0, 80)}" is neither a pull/merge request link nor a number.` };
}

// The target for this repo's origin: fills in the provider of a bare number and
// refuses a link to another project (or a hint that contradicts the host).
export function resolveTarget(input, originUrl) {
  const target = parseTarget(input);
  if (target.error) return target;
  const origin = parseRemote(originUrl);
  // An origin that is a local path or something odd: a bare number still works (GitHub's ref names, `!N` for GitLab's).
  if (!origin) return target.path
    ? { error: `Cannot read the origin remote (${String(originUrl).slice(0, 80)}), so the link cannot be checked against it. Enter the number instead.` }
    : { provider: target.provider ?? "github", number: target.number, host: null, path: null };
  if (target.path && target.path.toLowerCase() !== origin.path.toLowerCase()) {
    return { error: `This link is for ${target.host}/${target.path}, but this repository's origin is ${origin.host}/${origin.path}. Open Reviewer in a clone of that project.` };
  }
  const guess = providerOf(origin.host);
  if (target.provider && !target.path && target.provider !== guess) {
    return { error: `${target.provider === "gitlab" ? "!N is GitLab" : "#N is GitHub"} notation, but origin ${origin.host} looks like ${guess === "github" ? "GitHub" : "GitLab"}. Paste the full link instead.` };
  }
  return { provider: target.provider ?? guess, number: target.number, host: origin.host, path: origin.path };
}

// What to fetch from origin and where to keep it locally.
export function refFor(provider, number) {
  return provider === "github"
    ? { remote: `pull/${number}/head`, local: `refs/reviewer/pr/${number}` }
    : { remote: `merge-requests/${number}/head`, local: `refs/reviewer/mr/${number}` };
}

export const labelOf = (provider, number) => provider === "github" ? `PR #${number}` : `MR !${number}`;

const slashes = (path) => String(path).replaceAll("\\", "/").replace(/\/+$/, "");
const sameDir = (a, b) => { const x = slashes(a), y = slashes(b); return /^[A-Za-z]:|^\/\//.test(x) ? x.toLowerCase() === y.toLowerCase() : x === y; };

// `<parent of repo>/.reviewer-worktrees/<repo name>/pr-N`: outside the repo, so its
// status stays clean, and one folder per project, so two projects' #12 don't meet.
export function worktreePath(repoRoot, provider, number) {
  const root = slashes(repoRoot), cut = root.lastIndexOf("/");
  const name = root.slice(cut + 1).replace(/\.git$/, "") || "repo", parent = cut > 0 ? root.slice(0, cut) : root;
  return `${parent}/.reviewer-worktrees/${name}/${provider === "github" ? "pr" : "mr"}-${number}`;
}

// ---- the description from gh / glab ------------------------------------------

function checksOf(rollup) {
  if (!Array.isArray(rollup) || !rollup.length) return null;
  let failed = 0, pending = 0, passed = 0;
  for (const c of rollup) {
    const result = String(c.conclusion || c.state || "").toUpperCase(), status = String(c.status || "").toUpperCase();
    if (["FAILURE", "ERROR", "CANCELLED", "TIMED_OUT", "STARTUP_FAILURE", "ACTION_REQUIRED"].includes(result)) failed++;
    else if ((status && status !== "COMPLETED") || result === "PENDING" || result === "EXPECTED" || !result) pending++;
    else passed++;
  }
  return [passed && `${passed} passed`, failed && `${failed} failed`, pending && `${pending} pending`].filter(Boolean).join(", ");
}

// gh's `pr view --json` and glab's `mr view --output json`, in one shape.
export function normalizeInfo(provider, data, url) {
  const d = data && typeof data === "object" ? data : {};
  const body = String((provider === "github" ? d.body : d.description) ?? "");
  return provider === "github" ? {
    title: String(d.title ?? ""), body: body.slice(0, MAX_BODY), author: d.author?.login ?? d.author?.name ?? "",
    labels: (d.labels ?? []).map((l) => l?.name ?? String(l)).filter(Boolean), base: d.baseRefName || null, head: d.headRefName || null,
    state: String(d.state ?? "").toLowerCase(), url: d.url || url || "", checks: checksOf(d.statusCheckRollup), source: "gh",
  } : {
    title: String(d.title ?? ""), body: body.slice(0, MAX_BODY), author: d.author?.username ?? d.author?.name ?? "",
    labels: (d.labels ?? []).map((l) => l?.name ?? String(l)).filter(Boolean), base: d.target_branch || null, head: d.source_branch || null,
    state: String(d.state ?? "").toLowerCase(), url: d.web_url || url || "",
    checks: d.head_pipeline?.status ? `pipeline ${String(d.head_pipeline.status).replaceAll("_", " ")}` : null, source: "glab",
  };
}

// Why gh / glab gave nothing, in words for the person. Not fatal: the code can still be reviewed.
// `number` is the request asked for, or null when the open requests were listed instead.
export function cliProblem(cmd, number, result) {
  const text = `${result?.stderr ?? ""}\n${result?.stdout ?? ""}`.trim();
  const line = text.split(/\r?\n/).find((l) => l.trim())?.trim().slice(0, 160) ?? "";
  const listing = number == null, outcome = listing ? "the list is empty" : "the description is not shown";
  if (!result || result.code === 127 || /command not found|not recognized|ENOENT|No such file|cannot find the (file|path)|is not installed/i.test(text)) {
    return `\`${cmd}\` is not installed, so ${outcome}. Install it to ${listing ? "list requests" : "read the title and description"}.`;
  }
  if (/auth login|not logged|authentication|unauthorized|\b401\b|\b403\b|bad credentials|GH_TOKEN|GITLAB_TOKEN/i.test(text)) {
    return `\`${cmd}\` is not logged in for this host (run \`${cmd} auth login\`), so ${outcome}.${line ? ` (${line})` : ""}`;
  }
  if (/could not resolve|no pull requests? found|no merge requests? found|\b404\b|not found/i.test(text)) {
    return listing ? `The project was not found on the host (or no access).${line ? ` (${line})` : ""}`
      : `#${number} was not found on the host (wrong number, or no access).${line ? ` (${line})` : ""}`;
  }
  return `\`${cmd}\` could not ${listing ? "list the requests" : "read the description"}${line ? `: ${line}` : ""}.`;
}

// ---- the open requests of the project ------------------------------------------

const REVIEW = { APPROVED: "approved", CHANGES_REQUESTED: "changes requested", REVIEW_REQUIRED: "review required" };
export const LIST_LIMIT = 50;

// `gh pr list --json` and `glab mr list --output json`, in one row shape:
// { number, title, author, branch, draft, review, updated }.
export function normalizeList(provider, data) {
  if (!Array.isArray(data)) return [];
  return data.map((d) => provider === "github" ? {
    number: Number(d.number), title: String(d.title ?? ""), author: d.author?.login ?? d.author?.name ?? "", branch: d.headRefName ?? "",
    draft: d.isDraft === true, review: REVIEW[d.reviewDecision] ?? null, updated: d.updatedAt ?? "",
  } : {
    number: Number(d.iid), title: String(d.title ?? ""), author: d.author?.username ?? d.author?.name ?? "", branch: d.source_branch ?? "",
    draft: d.draft === true || d.work_in_progress === true || /^\s*(\[draft\]|draft:|\(draft\))/i.test(String(d.title ?? "")),
    review: null, updated: d.updated_at ?? "",
  }).filter((r) => Number.isInteger(r.number) && r.number > 0).slice(0, LIST_LIMIT);
}

// The command that lists the open requests; `mine` narrows to those waiting for the person's review.
export function listCommand(provider, { mine, path, host }) {
  const repo = !path ? [] : ["--repo", host === "github.com" || host === "gitlab.com" ? path : `${host}/${path}`];
  return provider === "github"
    ? ["gh", ["pr", "list", "--state", "open", "--limit", String(LIST_LIMIT), ...repo, "--json", "number,title,author,isDraft,headRefName,reviewDecision,updatedAt", ...(mine ? ["--search", "review-requested:@me"] : [])]]
    : ["glab", ["mr", "list", "--per-page", String(LIST_LIMIT), ...repo, "--output", "json", ...(mine ? ["--reviewer=@me"] : [])]];
}

// ---- running things ----------------------------------------------------------

async function run(exec, cmd, args, options) {
  try {
    const r = await exec(cmd, args, options);
    return { code: r?.code ?? 1, stdout: String(r?.stdout ?? ""), stderr: String(r?.stderr ?? "") };
  } catch (error) {
    return { code: 127, stdout: "", stderr: String(error?.message ?? error) };
  }
}
const first = (text) => String(text).split(/\r?\n/).find((l) => l.trim())?.replace(/^fatal:\s*/i, "").trim().slice(0, 200) ?? "";

async function describe(exec, target, cwd, on) {
  const repo = !target.path ? [] : ["--repo", target.host === "github.com" || target.host === "gitlab.com" ? target.path : `${target.host}/${target.path}`];
  const [cmd, args] = target.provider === "github"
    ? ["gh", ["pr", "view", String(target.number), ...repo, "--json", "title,body,author,labels,baseRefName,headRefName,state,url,statusCheckRollup"]]
    : ["glab", ["mr", "view", String(target.number), ...repo, "--output", "json"]];
  const r = await run(exec, cmd, args, { cwd, on, timeout: 30000 });
  if (r.code !== 0) return { problem: cliProblem(cmd, target.number, r) };
  try { return { info: normalizeInfo(target.provider, JSON.parse(r.stdout)) }; }
  catch { return { problem: `\`${cmd}\` returned something unreadable, so the description is not shown.` }; }
}

// The repository a folder belongs to: its top level, or the bare repo's own folder.
export async function repoOf(exec, cwd, on) {
  const git = (args) => run(exec, "git", args, { cwd, on });
  const top = await git(["rev-parse", "--show-toplevel"]);
  if (top.code === 0 && top.stdout.trim()) return { root: top.stdout.trim() };
  const bare = await git(["rev-parse", "--is-bare-repository"]);
  if (bare.code === 0 && bare.stdout.trim() === "true") {
    const dir = await git(["rev-parse", "--absolute-git-dir"]);
    if (dir.code === 0 && dir.stdout.trim()) return { root: dir.stdout.trim(), bare: true };
  }
  return { error: `${cwd} is not inside a Git repository.` };
}

// The open requests of the repo around `cwd`: { ok: true, items, provider } or
// { ok: false, problem } (no gh/glab, not logged in, no access, odd output).
// Never throws: the number box keeps working whatever happens here.
export async function listRequests({ exec, cwd, on = null, mine = true }) {
  if (!cwd) return { ok: false, problem: "No folder is shown." };
  const found = await repoOf(exec, cwd, on);
  if (found.error) return { ok: false, problem: found.error };
  const origin = await run(exec, "git", ["config", "--get", "remote.origin.url"], { cwd: found.root, on });
  if (origin.code !== 0 || !origin.stdout.trim()) return { ok: false, problem: "This repository has no `origin` remote." };
  const remote = parseRemote(origin.stdout.trim());
  const provider = remote ? providerOf(remote.host) : "github";
  const [cmd, args] = listCommand(provider, { mine, path: remote?.path, host: remote?.host });
  const r = await run(exec, cmd, args, { cwd: found.root, on, timeout: 30000 });
  if (r.code !== 0) return { ok: false, problem: cliProblem(cmd, null, r) };
  try { return { ok: true, items: normalizeList(provider, JSON.parse(r.stdout || "[]")), provider }; }
  catch { return { ok: false, problem: `\`${cmd}\` returned something unreadable, so the list is empty.` }; }
}

async function defaultBranch(git) {
  const head = await git(["symbolic-ref", "-q", "refs/remotes/origin/HEAD"]);
  if (head.code === 0 && head.stdout.trim()) return head.stdout.trim().replace(/^refs\/remotes\/origin\//, "");
  for (const b of ["main", "master"]) {
    if ((await git(["rev-parse", "--verify", "-q", `refs/remotes/origin/${b}`])).code === 0) return b;
  }
  return "main";
}

async function listedWorktrees(git) {
  const r = await git(["worktree", "list", "--porcelain"]);
  return r.code === 0 ? r.stdout.split(/\r?\n/).filter((l) => l.startsWith("worktree ")).map((l) => l.slice(9)) : [];
}

// Opens a request: fetch its head and its target branch, make or refresh the
// worktree, read the description. Returns { ok: true, pin } or { ok: false, error }.
// `pin` is what the panel keeps: { provider, number, label, repo, root, on, base,
// ref, path, sha, info (null without gh/glab), notes[] }.
export async function openReview({ exec, cwd, on = null, input }) {
  const found = await repoOf(exec, cwd, on);
  if (found.error) return { ok: false, error: found.error };
  const repo = found.root, git = (args, where = repo) => run(exec, "git", args, { cwd: where, on });
  const origin = await git(["config", "--get", "remote.origin.url"]);
  if (origin.code !== 0 || !origin.stdout.trim()) return { ok: false, error: "This repository has no `origin` remote to fetch the request from." };
  const target = resolveTarget(input, origin.stdout.trim());
  if (target.error) return { ok: false, error: target.error };
  const { provider, number } = target, ref = refFor(provider, number), notes = [];

  const described = await describe(exec, target, repo, on);
  if (described.problem) notes.push(described.problem);
  const info = described.info ?? null;
  const base = info?.base || await defaultBranch(git);
  if (!info?.base) notes.push(`The target branch is not known, so ${base} is used as the base.`);

  const fetched = await git(["fetch", "--no-tags", "origin", `+${ref.remote}:${ref.local}`]);
  if (fetched.code !== 0) {
    return { ok: false, error: `Could not fetch ${ref.remote} from origin: ${first(fetched.stderr) || "unknown error"}. Check the number, your access to the host, and whether the request is still open.` };
  }
  // The target branch, so the merge base is the request's own. Not fatal: an older copy still works.
  const baseFetched = await git(["fetch", "--no-tags", "origin", `+refs/heads/${base}:refs/remotes/origin/${base}`]);
  if (baseFetched.code !== 0) notes.push(`Could not update origin/${base} (${first(baseFetched.stderr) || "unknown error"}); the comparison uses the copy already here.`);

  await git(["worktree", "prune"]);
  const path = worktreePath(repo, provider, number);
  const listed = (await listedWorktrees(git)).some((p) => sameDir(p, path));
  if (listed) {
    const status = await git(["status", "--porcelain"], path);
    if (status.code === 0 && status.stdout.trim()) notes.push("The worktree has local changes, so it stays on the commit it had.");
    else {
      const moved = await git(["checkout", "--detach", ref.local], path);
      if (moved.code !== 0) return { ok: false, error: `Could not update the worktree ${path}: ${first(moved.stderr) || "unknown error"}` };
    }
  } else {
    const added = await git(["worktree", "add", "--detach", path, ref.local]);
    if (added.code !== 0) return { ok: false, error: `Could not create the worktree ${path}: ${first(added.stderr) || "unknown error"}` };
  }
  const top = await git(["rev-parse", "--show-toplevel"], path);
  const sha = await git(["rev-parse", "--short", "HEAD"], path);
  if (top.code !== 0 || !top.stdout.trim()) return { ok: false, error: `The worktree ${path} cannot be read: ${first(top.stderr)}` };
  return {
    ok: true,
    pin: { provider, number, label: labelOf(provider, number), repo, root: top.stdout.trim(), on, base, ref: ref.local, path, sha: sha.stdout.trim(), info, notes },
  };
}

// Takes the worktree and the local ref away. Local changes in the worktree
// stop it ({ ok: false, dirty: true }) until `force` says to discard them.
export async function closeReview({ exec, pin, force = false }) {
  const git = (args, where = pin.repo) => run(exec, "git", args, { cwd: where, on: pin.on ?? null });
  const listed = (await listedWorktrees(git)).some((p) => sameDir(p, pin.path));
  if (listed) {
    if (!force) {
      const status = await git(["status", "--porcelain"], pin.path);
      if (status.code === 0 && status.stdout.trim()) return { ok: false, dirty: true, error: `The worktree has local changes (${pin.path}).` };
    }
    const removed = await git(["worktree", "remove", ...(force ? ["--force"] : []), pin.path]);
    if (removed.code !== 0) return { ok: false, error: `Could not remove the worktree: ${first(removed.stderr) || "unknown error"}` };
  }
  await git(["update-ref", "-d", pin.ref]);
  await git(["worktree", "prune"]);
  return { ok: true };
}
