import assert from "node:assert/strict";
import { test } from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { register } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gitInventory, ignoredInventory, buildTree, visibleRows, fileLines } from "../mods/reviewer/files.js";

test("worktree ignore exceptions, deleted paths and historical files", async (t) => {
  const cwd = mkdtempSync(join(tmpdir(), "reviewer-files-"));
  t.after(() => rmSync(cwd, { recursive: true, force: true }));
  const git = (...args) => execFileSync("git", args, { cwd, encoding: "utf8" });
  git("init", "-q");
  mkdirSync(join(cwd, "src"));
  const put = (path, text) => writeFileSync(join(cwd, path), text);
  put(".gitignore", "*.log\n");
  put("src/.gitignore", "!keep.log\n");
  put("src/deleted.txt", "before\n");
  git("add", ".");
  git("-c", "user.name=Test", "-c", "user.email=test@localhost", "commit", "-qm", "base");
  git("rm", "-q", "src/deleted.txt");
  put("src/debug.log", "ignored");
  put("src/keep.log", "included");
  const read = args => git(...args);
  mkdirSync(join(cwd, "dist")); put("dist/bundle.js", "x"); put(".gitignore", "*.log\ndist/\n");
  const normal = await gitInventory(read, null);
  assert(normal.includes("src/keep.log"));
  assert(!normal.includes("src/debug.log"));
  assert(!normal.some(path => path.startsWith("dist")));
  // Ignored files are listed on their own; a wholly ignored folder is one entry, not its files.
  const ignored = await ignoredInventory(read);
  assert(ignored.files.includes("src/debug.log"));
  assert.deepEqual(ignored.directories, ["dist"]);
  assert(!ignored.files.some(path => path.startsWith("dist")));
  const shown = buildTree(normal.concat(ignored.files), [], ignored.directories, new Set([...ignored.files, ...ignored.directories]));
  const rowFor = path => visibleRows(shown, new Set(["src"])).find(row => row.path === path);
  assert(rowFor("dist").ignored && rowFor("dist").children.length === 0);
  assert(rowFor("src/debug.log").ignored && !rowFor("src/keep.log").ignored);
  const historical = await gitInventory(read, "HEAD");
  assert(historical.includes("src/deleted.txt"));
  assert(!historical.includes("src/keep.log"));
  const tree = buildTree(normal, [{ path: "src/deleted.txt", status: "D" }]);
  assert(visibleRows(tree, new Set()).find(row => row.path === "src").changed);
  assert(visibleRows(tree, new Set(["src"])).some(row => row.path === "src/deleted.txt" && row.status === "D"));
});

test("source rows preserve blank lines, diff-like text and CRLF line numbers", () => {
  assert.deepEqual(fileLines("@@ title\r\n\r\n+code\r\n"), [" @@ title", " ", " +code"]);
  assert.deepEqual(fileLines(""), []);
  assert(!fileLines("binary\0data")[0].startsWith(" "));
});

// Drive the panel's real refresh, selection and submission handlers. Only
// Herdr's host API and frame scheduler are substituted; Git and files are real.
test("review follows the focused folder and preserves the quoted snapshot", async t => {
  const temp = mkdtempSync(join(tmpdir(), "reviewer-flow-"));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  const repo = join(temp, "repo"), ordinary = join(temp, "notes");
  mkdirSync(repo); mkdirSync(ordinary);
  const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" }).trim();
  git("init", "-qb", "main");
  writeFileSync(join(repo, "same.txt"), "first\nmiddle\nlast\n");
  git("add", ".");
  git("-c", "user.name=Test", "-c", "user.email=test@localhost", "commit", "-qm", "base");
  git("switch", "-qc", "feature");
  writeFileSync(join(repo, "changed.txt"), "added\n");
  git("add", ".");
  git("-c", "user.name=Test", "-c", "user.email=test@localhost", "commit", "-qm", "feature");
  const sha = git("rev-parse", "HEAD");
  writeFileSync(join(repo, "changed.txt"), "modified\n");
  writeFileSync(join(ordinary, "note.txt"), "standalone\n");
  let cwd = repo, sent, launched, overlay;
  const state = new Map(), no = () => {};
  const host = {
    View: class {}, shared: k => state.get(k), setShared: (k,v) => state.set(k,v),
    focused: () => ({ cwd, space: "space" }), spaces: () => [{ id: "space", active: true }],
    checking: () => true, settings: () => ({}), props: () => ({}),
    window: () => ({ platform: process.platform === "win32" ? "windows" : "linux" }),
    watchFolder: () => Object.assign(new Promise(no), { cancel: no }),
    nextCommand: () => new Promise(no),
    openOverlay: options => { overlay = options; sent = options.props.context; },
    run: (command, options) => { assert.equal(command, "tab.new"); launched = options; },
    appHome: () => join(temp, "home"), theme: () => ({ background: "#101010", foreground: "#eeeeee" }),
    readTextFile: path => Promise.resolve(existsSync(path) ? readFileSync(path, "utf8") : null),
    writeTextFile: (path, text) => { mkdirSync(join(path, ".."), { recursive: true }); writeFileSync(path, text); return Promise.resolve(null); },
    exec: async (cmd, args, opts) => {
      const r = spawnSync(cmd, args, { cwd: opts.cwd, encoding: "utf8" });
      if (r.error) throw r.error;
      return { code: r.status, stdout: r.stdout, stderr: r.stderr };
    },
    InputState: class { static new() { return new this(); } on() {} set_value() {} },
    TextareaState: class { static new() { return new this(); } on() {} set_auto_grow() {} focus() {} set_value(s) { this.s = s; } value() { return this.s; } },
    VirtualListScrollHandle: class { static new() { return new this(); } scroll_to_item() {} }
  };
  globalThis.reviewerTestHost = host;
  const hostModules = {
    herdr: "appHome writeTextFile spaces panes focused exec readTextFile watchFolder theme settings nextCommand props shared setShared checking layout run window notify openOverlay agents knownAgents hc closeOverlay keys",
    "gpui-kit": "View div svg image",
    "gpui-base": "v_flex h_flex TextView InputState Input TextareaState Textarea Scrollbar v_virtual_list VirtualListScrollHandle Popover v_resizable resizable_panel"
  };
  // Register a loader in this test process using the Node 20/22 API.
  const loader = `
    const hosts = ${JSON.stringify(hostModules)};
    export function resolve(id, ctx, next) {
      if (!Object.hasOwn(hosts, id)) return next(id, ctx);
      const source = "export const {" + hosts[id].split(" ").join(",") + "} = globalThis.reviewerTestHost";
      return { shortCircuit: true, url: "data:text/javascript," + encodeURIComponent(source) };
    }`;
  register("data:text/javascript," + encodeURIComponent(loader), import.meta.url);
  t.after(() => { delete globalThis.reviewerTestHost; });
  const { default: Reviewer } = await import("../mods/reviewer/main.js");
  const panel = new Reviewer(), pending = [];
  const cx = { notify: no, focus_handle: () => ({ focus: no }), timer: { every: no, after: no },
    spawn: fn => { const job = fn(cx); if (panel.loading || panel.submission) pending.push(job); } };
  panel.watch = no;
  const done = async () => { while (pending.length) await pending.shift(); assert.ifError(panel.error && Error(panel.error)); };
  // init starts a permanent command listener; discard just that pending job.
  panel.init({}, cx); pending.pop(); await done();
  assert.equal(panel.scope, "work");
  panel.toggleBrowser(cx); await done();
  const comment = async (path, from, to, text) => {
    panel.open = path; await panel.load(path, panel.context);
    panel.clickRow(from, cx); if (from !== to) panel.clickRow(to, cx);
    panel.note.set_value(text); panel.addComment(cx);
  };
  await comment("changed.txt", panel.rows.findIndex(r => r.kind === "+"), panel.rows.findIndex(r => r.kind === "+"), "diff");
  await comment("same.txt", 0, 2, "source");
  writeFileSync(join(repo, "same.txt"), "first\nreplacement\nlast\n");
  panel.refresh(cx); await done();
  panel.submit(cx); await done();
  assert.match(sent, /changed\.txt, line 1/);
  assert.match(sent, /same\.txt, lines 1-3[\s\S]*middle/);
  assert(!sent.includes("replacement"));
  panel.finishSubmission(panel.submission.sent, false, cx);
  panel.setScope("commit", cx, sha); await done();
  await comment("same.txt", 1, 1, "historic"); panel.submit(cx); await done();
  assert(sent.includes(sha)); assert(sent.includes("middle")); assert(!panel.canEdit());
  panel.finishSubmission(panel.submission.sent, false, cx);
  cwd = ordinary; panel.refresh(cx); await done();
  assert(panel.plain); assert(panel.lookup("note.txt")); assert.equal(panel.comments.length, 0);
  await comment("note.txt", 0, 0, "note"); assert(panel.canEdit());
  // A Markdown file opens as a document; a comment on a block is an ordinary line comment.
  writeFileSync(join(ordinary, "plan.md"), ["---", "title: Plan", "---", "", "# Goal", "Ship it.", "", "```mermaid", "flowchart LR", " A --> B", "```", ""].join("\n"));
  panel.refresh(cx); await done();
  panel.open = "plan.md"; await panel.load("plan.md", panel.context);
  assert.deepEqual(panel.doc.blocks.map(b => [b.kind, b.start, b.end]), [["metadata", 1, 3], ["markdown", 5, 6], ["mermaid", 8, 11]]);
  assert(panel.documentShown(), "an unchanged Markdown file opens as a document");
  for (let i = 0; i < 50 && !panel.doc.blocks[2].image; i++) await new Promise(r => setTimeout(r, 20));
  const picture = panel.doc.blocks[2].image;
  assert(picture.asset.startsWith("data/reviewer-mermaid/") && picture.asset.endsWith(".svg"), "the Mermaid block is drawn");
  assert.match(readFileSync(join(temp, "home", picture.asset), "utf8"), /<svg/);
  panel.popOut(panel.doc.blocks[2], "Lines 8–11");
  assert.equal(overlay.props.viewer.asset, picture.asset, "Pop out opens the diagram in an overlay");
  assert(overlay.props.viewer.title.startsWith("plan.md"));
  panel.commentBlock(panel.doc.blocks[1], cx);
  assert.equal(panel.composer.doc, true);
  panel.note.set_value("name the goal"); panel.addComment(cx);
  const block = panel.comments.find(c => c.path === "plan.md");
  assert.deepEqual([block.from.number, block.to.number], [5, 6]);
  panel.toggleDocument(cx);
  assert(!panel.documentShown());
  assert(panel.items.some(it => it.kind === "comment"), "the block comment shows under its lines in the source view");
  panel.toggleDocument(cx);
  panel.submit(cx); await done();
  assert(sent.includes("### plan.md, lines 5-6\n    5   # Goal\n    6   Ship it.\n\nComment: name the goal"), sent);
  panel.finishSubmission(panel.submission.sent, false, cx);
  panel.setComments([], cx);
  const { openEditor } = await import("../mods/reviewer/workspace.js");
  const filename = "my 'notes' ü.txt";
  openEditor(ordinary, filename, "space", null);
  const probe = join(temp, "editor probe.cjs");
  writeFileSync(probe, "process.stdout.write(JSON.stringify(process.argv.slice(2)))");
  const [shell, ...args] = launched.argv;
  const captured = execFileSync(shell, args, { cwd: ordinary, encoding: "utf8",
    env: { ...process.env, VISUAL: `node "${probe}"`, EDITOR: "missing-editor" } });
  assert.deepEqual(JSON.parse(captured), [ordinary + "/" + filename]);
  // No Git work tree: a bare repository (git: "this operation must be run in a work tree")
  // and a plain folder both fall back to the folder view and say why.
  assert.match(panel.gitNote, /not a git repository/i);
  const bare = join(temp, "bare.git");
  execFileSync("git", ["init", "-q", "--bare", bare]);
  cwd = bare; panel.refresh(cx); await done();
  assert(panel.plain, "a bare repository is browsed as a folder");
  assert.equal(panel.error, null);
  assert(panel.gitNote.startsWith("No Git changes here ("), panel.gitNote);
  assert(panel.gitNote.endsWith("). Showing the folder's files."), panel.gitNote);
  assert(panel.lookup("HEAD"));
  cwd = repo; panel.refresh(cx); await done();
  assert.equal(panel.gitNote, null, "the note goes away once Git has a work tree");
  assert.equal(panel.scope, "commit"); assert.equal(panel.comments[0].text, "historic");
});
