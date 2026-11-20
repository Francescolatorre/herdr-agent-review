import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, Scrollbar, v_virtual_list } from "gpui-base";
import { exec, readTextFile, theme, settings, checking, focused, spaces } from "herdr";
import { parseStatus, parseDiff, addedDiff, fingerprint, anchor, draftKey, decodeDraft, feedback } from "./review.js";

const READ = ["--no-optional-locks", "--literal-pathspecs", "-c", "core.fsmonitor=false", "-c", "core.hooksPath=", "-c", "diff.autoRefreshIndex=false"];
const LIMIT = 400000;

export default class AgentReview extends View {
  init(props, cx) {
    const space = spaces().find(s => s.active);
    this.folder = props?.folder || focused()?.cwd || space?.folder;
    this.machine = props?.machine ?? space?.machine ?? null;
    this.files = []; this.rows = []; this.comments = []; this.selected = null;
    this.height = 600; this.error = ""; this.notice = ""; this.preview = false;
    this.message = InputState.new({ placeholder: "What should change on this line?" });
    this.message.on("change", (_e, cx) => cx.notify());
    this.message.on("submit", (_e, cx) => this.saveComment(cx));
    if (!checking()) this.refresh(cx);
  }

  async git(args) {
    const result = await exec("git", [...READ, ...args], { cwd: this.root || this.folder, on: this.machine });
    if (result.code !== 0) throw new Error((result.stderr || result.stdout || "Git command failed").trim());
    return result.stdout;
  }

  async fileDiff(file) {
    if (file.fresh || !this.hasHead) {
      if (file.status.includes("D")) return "";
      const text = await readTextFile(`${this.root}/${file.path}`, { on: this.machine });
      if (text === null) throw new Error("File is binary, too large or unreadable.");
      if (text.length > LIMIT || text.includes("\0")) throw new Error("Binary or large file: preview unavailable.");
      return addedDiff(text);
    }
    const text = await this.git(["diff", "HEAD", "--no-renames", "--no-ext-diff", "--no-textconv", "--no-color", "--", file.path]);
    if (text.length > LIMIT) throw new Error("Diff exceeds the 400,000 character preview limit.");
    return text;
  }

  persist() {
    if (this.storageError || !this.root) return;
    try {
      localStorage.setItem(draftKey(this.machine, this.root), JSON.stringify({ version: 1, comments: this.comments }));
    } catch (error) { this.storageError = true; this.error = `Cannot save draft: ${error}`; }
  }

  refresh(cx, previewAfter = false) {
    if (this.busy || !this.folder) { if (!this.folder) this.error = "Open this mod with a repository folder."; return; }
    this.busy = true; this.error = ""; this.selected = null;
    cx.spawn(async (cx) => {
      try {
        if (!this.root) {
          this.root = (await this.git(["rev-parse", "--show-toplevel"])).trim();
          try { this.comments = decodeDraft(localStorage.getItem(draftKey(this.machine, this.root))); }
          catch (error) { this.storageError = true; throw error; }
        }
        try { await this.git(["rev-parse", "--verify", "HEAD"]); this.hasHead = true; }
        catch { this.hasHead = false; }
        this.files = parseStatus(await this.git(["status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"]));
        const cache = new Map();
        for (const path of new Set(this.comments.map(c => c.path))) {
          const file = this.files.find(f => f.path === path);
          try { cache.set(path, file ? await this.fileDiff(file) : null); }
          catch { cache.set(path, null); }
        }
        this.comments = this.comments.map(c => ({ ...c, stale: cache.get(c.path) === null || fingerprint(cache.get(c.path)) !== c.fingerprint }));
        this.persist();
        this.open = this.files.some(f => f.path === this.open) ? this.open : this.files[0]?.path;
        this.rows = []; this.diffHash = null;
        if (this.open) {
          const text = cache.has(this.open) ? cache.get(this.open) : await this.fileDiff(this.files.find(f => f.path === this.open));
          if (text === null) this.notice = "Preview unavailable for this file.";
          else this.setDiff(text);
        } else this.notice = "No uncommitted changes.";
        if (previewAfter) this.preview = true;
      } catch (error) { this.error = String(error); }
      finally { this.busy = false; cx.notify(); }
    });
    cx.notify();
  }

  setDiff(text) {
    this.diffHash = fingerprint(text);
    this.rows = parseDiff(text);
    this.notice = this.rows.length ? "Click a code line to comment. Refresh checks saved comments against the latest diff." : "No text diff (binary, mode-only change or empty file).";
  }

  pick(path, cx) {
    if (this.busy) return;
    this.open = path; this.selected = null; this.rows = []; this.error = ""; this.busy = true;
    cx.spawn(async (cx) => {
      try { this.setDiff(await this.fileDiff(this.files.find(f => f.path === path))); }
      catch (error) { this.error = String(error); }
      finally { this.busy = false; cx.notify(); }
    });
    cx.notify();
  }

  select(row, cx) {
    if (this.busy || !anchor(row)) return;
    this.selected = { path: this.open, ...anchor(row), fingerprint: this.diffHash };
    this.editing = null; this.message.set_value(""); this.message.focus(); cx.notify();
  }

  saveComment(cx) {
    const body = this.message.value().trim();
    if (!body || !this.selected || this.busy || this.storageError) return;
    const comment = { ...this.selected, id: this.editing || `${Date.now()}-${Math.random().toString(36).slice(2)}`, body };
    this.comments = this.editing ? this.comments.map(c => c.id === this.editing ? comment : c) : [...this.comments, comment];
    this.persist(); this.selected = null; this.editing = null; this.message.set_value(""); cx.notify();
  }

  button(id, text, action, t, active = false) {
    return div().id(id).px(10).py(6).rounded(6).cursor_pointer().bg(active ? t.solid : t.raised)
      .text_color(active ? t.solid_foreground : t.foreground).hover(s => s.opacity(0.85)).on_click(action).child(text);
  }

  render(cx) {
    const t = theme(), button = (id, text, fn, active) => this.button(id, text, fn, t, active);
    const comments = this.comments;
    const contentHeight = Math.max(100, this.height - (this.selected ? 220 : 154));
    const diffWidth = Math.max(300, ...this.rows.map(r => r.text.length * 7.5 + 115));
    const previewText = feedback(this.root || this.folder || "", this.machine, comments);
    return v_flex().id("agent-review").size_full().min_h(0).bg(t.background).text_color(t.foreground).text_size(12)
      .on_size_change((size, cx) => { if (this.height !== size.height) { this.height = size.height; cx.notify(); } })
      .child(h_flex().h(46).flex_none().px(12).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().font_semibold().text_size(15).child("Agent Review"))
        .child(div().flex_1())
        .child(button("refresh", this.busy ? "Loading…" : "Refresh", (_e, cx) => this.refresh(cx)))
        .child(button("preview", this.preview ? "Back to diff" : `Feedback (${comments.length})`, (_e, cx) => {
          if (this.preview) { this.preview = false; cx.notify(); } else this.refresh(cx, true);
        }, this.preview)))
      .child(div().h(28).flex_none().px(12).text_color(t.muted).truncate().child(`${this.machine || "local"} · ${this.root || this.folder || "No repository"}`))
      .when(Boolean(this.error), el => el.child(div().px(12).py(6).text_color(t.ansi1).child(this.error)))
      .when(this.preview, el => el.child(v_flex().h(contentHeight).min_h(0).gap(8).p(12)
        .child(h_flex().gap(8).items_center()
          .child(button("copy", "Copy feedback", (_e, cx) => { cx.write_to_clipboard(previewText); this.notice = "Feedback copied. Nothing has been sent."; cx.notify(); }, true))
          .child(div().text_color(t.muted).child("Saved locally · no automatic sending")))
        .child(div().id("feedback-scroll").flex_1().min_h(0).overflow_y_scrollbar().children(
          previewText.split("\n").map(line => div().py(2).child(line || " "))))))
      .when(!this.preview, el => el.child(h_flex().h(contentHeight).min_h(0)
        .child(div().w(210).flex_none().h_full().border_r(1).border_color(t.border).overflow_y_scrollbar().children(
          this.files.map(file => div().id(`file-${file.path}`).px(10).py(8).cursor_pointer()
            .bg(file.path === this.open ? t.selected : t.background).hover(s => s.bg(t.hover))
            .on_click((_e, cx) => this.pick(file.path, cx)).child(`${file.status}  ${file.path}`))))
        .child(v_flex().flex_1().min_w(0).h_full()
          .child(div().px(10).h(26).flex_none().text_color(t.muted).truncate().child(this.open || "No changed files"))
          .child(div().flex_1().min_h(0).relative().font_family(settings().font_family || "JetBrains Mono")
            .child(div().id("review-diff-x").size_full().overflow_x_scrollbar().child(div().min_w(diffWidth).w_full().h_full()
              .child(v_virtual_list("review-diff", this.rows.length, 24, i => String(i), range =>
                this.rows.slice(range.start, range.end).map((row, offset) => {
                  const a = anchor(row), chosen = this.selected?.path === this.open && a && this.selected.side === a.side && this.selected.line === a.line;
                  return h_flex().id(`line-${range.start + offset}`).h(24).px(8).gap(8).items_center()
                    .bg(chosen ? t.selected : row.kind === "+" ? t.ansi2 + "18" : row.kind === "-" ? t.ansi1 + "18" : t.background)
                    .when(Boolean(a), e => e.cursor_pointer().on_click((_e, cx) => this.select(row, cx)))
                    .child(div().w(36).text_right().text_color(t.dim).child(String(row.old ?? "")))
                    .child(div().w(36).text_right().text_color(t.dim).child(String(row.next ?? "")))
                    .child(div().w(12).text_color(t.muted).child(row.kind))
                    .child(div().child(row.text.replace(/\t/g, "    ") || " "));
                })).size_full())))
            .child(Scrollbar.vertical("review-diff").viewport_from_layout().absolute().inset_0())))))
      .when(Boolean(this.selected), el => el.child(v_flex().flex_none().p(10).gap(6).border_t(1).border_color(t.border)
        .child(div().text_color(t.muted).child(`${this.selected?.path}:${this.selected?.line} · ${this.selected?.side} version`))
        .child(h_flex().gap(8)
          .child(Input.new(this.message).h(34).flex_1().px(8).border_1().border_color(t.input).rounded(6).text_color(t.foreground))
          .child(button("save-comment", this.editing ? "Update" : "Add comment", (_e, cx) => this.saveComment(cx), true))
          .child(button("cancel-comment", "Cancel", (_e, cx) => { this.selected = null; cx.notify(); })))))
      .child(h_flex().h(30).flex_none().px(10).gap(8).items_center()
        .child(div().flex_1().truncate().text_color(t.muted).child(this.notice || "Review uncommitted changes")))
      .when(comments.length > 0 && !this.preview, el => el.child(div().id("comment-list").h(50).flex_none().overflow_y_scrollbar().children(comments.map(c =>
        h_flex().px(10).py(3).gap(8).items_center()
          .child(div().flex_1().truncate().text_color(c.stale ? t.blocked : t.muted).child(`${c.stale ? "Recheck · " : ""}${c.path}:${c.line} — ${c.body}`))
          .child(button(`edit-${c.id}`, "Edit", (_e, cx) => { this.selected = { ...c }; this.editing = c.id; this.message.set_value(c.body); this.message.focus(); cx.notify(); }))
          .child(button(`delete-${c.id}`, "Remove", (_e, cx) => { this.comments = this.comments.filter(item => item.id !== c.id); this.persist(); cx.notify(); }))))));
  }
}
