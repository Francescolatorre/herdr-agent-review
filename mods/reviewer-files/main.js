// Adapted from herdr-app’s Files mod (Apache-2.0). See LICENSE.herdr.
// A lazy file browser for the focused pane's folder, with bounded read-only previews.
import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex, Editor, EditorState, TextView, Textarea, TextareaState } from "gpui-base";
import { spaces, panes, focused, exec, readTextFile, watchFolder, theme, settings, window, appHome, writeTextFile, shared, setShared, openOverlay, notify } from "herdr";

import { documentBlocks } from "./document.js";
import { diagram, imageKey } from "./diagram.js";

const DRAFTS = "reviewer.files.drafts", SENT = "reviewer.sent";

function location() {
  const space = spaces().find(s => s.active), f = focused();
  const pane = f?.pane ? panes().find(p => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder, on, space: space?.id };
}
const key = () => JSON.stringify(location());
const LANG = { ts: "js", tsx: "js", mts: "js", cts: "js", jsx: "js", mjs: "js", toml: "yaml", jsonc: "json", svelte: "html", vue: "html" };
const PER_FOLDER = 500, TOTAL = 5000;

async function directory(path, on) {
  const windowsDirectory = async () => {
    // Windows PowerShell otherwise uses the console code page; exec decodes UTF-8.
    // Links keep directory attributes even when dangling; check their target.
    // Other reparse points (OneDrive's folders) have no LinkType and are folders.
    // PowerShell reads curly single quotes as quotes too, so they're doubled like '.
    const r = await exec("powershell", ["-NoProfile", "-Command", "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false); & { param($p) @(Get-ChildItem -LiteralPath $p -Force -ErrorAction Stop | Where-Object Name -ne '.git' | Select-Object -First 501 | ForEach-Object { @{ name=$_.Name; dir=($_.PSIsContainer -and (-not ($_.Attributes -band [IO.FileAttributes]::ReparsePoint) -or -not $_.LinkType -or ($_.Target -and [IO.Directory]::Exists(([IO.Path]::Combine([IO.Path]::GetDirectoryName($_.FullName), $_.Target[0])))))) } }) | ConvertTo-Json -Compress } '" + path.replace(/['‘’‚‛]/g, "$&$&") + "'"], { on });
    if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
    const result = JSON.parse(r.stdout || "[]");
    return Array.isArray(result) ? result : [result];
  };
  if (!on && window()?.platform === "windows") return windowsDirectory();
  const script = 'n=0; for p in "$1"/* "$1"/.[!.]* "$1"/..?*; do [ -e "$p" ] || [ -L "$p" ] || continue; name=${p##*/}; [ "$name" = .git ] && continue; if [ -d "$p" ]; then kind=d; else kind=f; fi; printf "%s\\0%s\\0" "$kind" "$name"; n=$((n+1)); [ "$n" -gt 500 ] && break; done; test -d "$1"';
  let r;
  try { r = await exec("sh", ["-c", script, "files", path], { on }); }
  catch (e) {
    if (on && String(e).includes("cannot start sh: program not found")) return windowsDirectory();
    throw e;
  }
  if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
  const fields = r.stdout.split("\0"), out = [];
  for (let i = 0; i + 1 < fields.length; i += 2) out.push({ name: fields[i + 1], dir: fields[i] === "d" });
  return out;
}

export default class Files extends View {
  init(_props, cx) {
    this.saved = new Map();
    this.entries = new Map(); this.folders = new Set(); this.pending = new Set(); this.marks = {};
    this.refresh(cx);
    cx.timer.every(10000, cx => this.refresh(cx));
  }

  watch(root, cx) {
    if (this.on || this.watched === root) return;
    this.watched = root;
    const context = this.context;
    cx.spawn(async cx => {
      try { while (this.context === context) { await watchFolder(root); if (this.current(context)) this.refresh(cx); } }
      catch { if (this.context === context) this.watched = null; }
    });
  }

  current(context) {
    return this.context === context && key() === context.key;
  }

  async loadFolder(path, context) {
    const { on, cwd: root } = context;
    const entries = await directory(path ? `${root}/${path}` : root, on);
    if (!this.current(context) || (path && !this.folders.has(path))) return;
    const used = [...this.entries.entries()].filter(([p]) => p !== path).reduce((n, [, e]) => n + e.length, 0);
    this.entries.set(path, entries.slice(0, Math.max(0, Math.min(PER_FOLDER, TOTAL - used))).sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name)));
    if (entries.length > PER_FOLDER || used + entries.length > TOTAL) this.limited = true;
  }

  refresh(cx) {
    const { cwd, on } = location(), next = key();
    if (next !== this.context?.key) {
      if (this.context) this.saved.set(this.context.key, { folders: this.folders, file: this.file });
      const saved = this.saved.get(next);
      this.context = { key: next, cwd, on }; this.root = cwd; this.on = on; this.entries = new Map(); this.folders = new Set(saved?.folders);
      this.pending = new Set(); this.marks = {}; this.show(null); this.watched = null; this.error = null; this.limited = false;
      this.loading = false;
      if (saved?.file) this.show(saved.file, cx);
    }
    if (!cwd || this.loading) return;
    const context = this.context;
    this.loading = true;
    this.limited = false;
    cx.spawn(async cx => {
      try {
        for (const path of ["", ...this.folders]) {
          if (!this.current(context)) return;
          await this.loadFolder(path, context);
        }
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on }).catch(() => null);
        const marks = {};
        if (top?.code === 0) {
          // Writes nothing under .git (index lock, fsmonitor cookie): the folder watch would refresh again.
          const status = await exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"], { cwd, on }).catch(() => null);
          if (status?.code === 0) for (const entry of status.stdout.split("\0").filter(Boolean).slice(0, TOTAL)) {
            const xy = entry.slice(0, 2);
            marks[`${top.stdout.trim()}/${entry.slice(3)}`] = xy === "??" || xy.includes("A") ? "A" : xy.includes("U") ? "U" : xy.includes("D") ? "D" : "M";
          }
        }
        if (!this.current(context)) return;
        this.marks = marks; this.error = null; this.watch(cwd, cx);
      } catch (e) { if (this.current(context)) this.error = String(e); }
      finally { if (this.context === context) this.loading = false; cx.notify(); }
    });
  }

  toggle(path, cx) {
    if (this.folders.has(path)) {
      for (const folder of [...this.folders]) if (folder === path || folder.startsWith(path + "/")) {
        this.folders.delete(folder);
        this.entries.delete(folder);
      }
    } else {
      this.folders.add(path);
      if (!this.entries.has(path) && !this.pending.has(path)) {
        const context = this.context;
        this.pending.add(path);
        cx.spawn(async cx => {
          try { await this.loadFolder(path, context); }
          catch (e) { if (this.current(context)) this.error = String(e); }
          finally { if (this.context === context) this.pending.delete(path); cx.notify(); }
        });
      }
    }
    cx.notify();
  }

  show(path, cx) {
    this.code?.release(); this.code = null; this.file = path; this.fileError = null;
    this.document = null; this.source = false; this.comment = null; this.openSource = new Set();
    if (!path || !cx) return;
    const context = this.context, root = this.root, on = this.on;
    const request = {}; this.previewRequest = request;
    cx.spawn(async cx => {
      try {
        const text = await readTextFile(`${root}/${path}`, { on });
        if (this.previewRequest !== request || this.file !== path || !this.current(context)) return;
        if (text === null) { this.fileError = "This file is no longer available"; return; }
        if (text.includes("\0")) { this.fileError = "Binary file · no text preview"; return; }
        const t = theme(), ext = path.includes(".") ? path.split(".").pop() : "txt";
        this.code = EditorState.new({ language: LANG[ext] ?? ext, readonly: true,
          value: text.length > 400000 ? text.slice(0, 400000) + "\n… (file truncated)" : text,
          font_family: settings().font_family, font_size: settings().font_size,
          syntax: { keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6 } });
        if (["md", "markdown"].includes(ext.toLowerCase()) && text.length <= 400000) {
          this.document = documentBlocks(text);
          cx.notify();
          for (const block of this.document.filter(block => block.kind === "mermaid").slice(0, 20)) {
            if (this.previewRequest !== request || !this.current(context)) return;
            try {
              const graphic = diagram(block.body, t);
              if (!graphic) continue;
              const asset = `data/reviewer-mermaid/${imageKey(graphic.svg)}.svg`;
              const cache = `${appHome()}/${asset}`;
              if (await readTextFile(cache) === null) {
                try { await writeTextFile(cache, graphic.svg, null); }
                catch (error) { if (await readTextFile(cache) !== graphic.svg) throw error; }
              }
              block.image = { asset, width: graphic.width, height: graphic.height };
            } catch { /* The diagram remains available as commentable source. */ }
            cx.notify();
          }
        }
      } catch { if (this.file === path && this.current(context)) this.fileError = "Cannot preview this file (binary, too large, or unreadable)"; }
      finally { cx.notify(); }
    });
  }

  draftKey(context = this.context) {
    return JSON.stringify([context?.on, context?.cwd]);
  }

  comments(key = this.draftKey()) {
    return shared(DRAFTS)?.[key] ?? [];
  }

  setComments(key, comments) {
    const drafts = { ...(shared(DRAFTS) ?? {}) };
    if (comments.length) drafts[key] = comments; else delete drafts[key];
    setShared(DRAFTS, drafts);
  }

  startComment(block, existing, cx) {
    const input = TextareaState.new({ placeholder: "Leave a comment…", rows: 3 });
    if (existing) input.set_value(existing.note);
    this.comment = { block, input, existing };
    input.focus();
    cx.notify();
  }

  saveComment(cx) {
    const { block, input, existing } = this.comment;
    const note = input.value().trim();
    if (!note) return;
    const key = this.draftKey();
    this.setComments(key, [...this.comments(key).filter(item => item.id !== existing?.id), {
      id: existing?.id ?? `${Date.now()}-${Math.random()}`, path: this.file,
      start: block.start, end: block.end, source: block.text, note,
    }]);
    this.comment = null;
    cx.notify();
  }

  submit(cx) {
    const key = this.draftKey(), comments = this.comments(key);
    if (this.submission || !comments.length) return;
    const origin = focused(), sent = `files-${Date.now()}-${Math.random()}`;
    const title = `File review · ${comments.length} comment${comments.length === 1 ? "" : "s"}`;
    const sections = comments.map(item =>
      `### ${item.path}, lines ${item.start}–${item.end}
${item.source}

Comment: ${item.note}`);
    try {
      openOverlay({ mod: "reviewer", kind: "dialog", modal: true, width: 680, height: 560,
        props: { dialog: true, title, context: `File review of ${this.root}${this.on ? ` (on ${this.on})` : ""}

${sections.join("\n\n")}`,
          sent, space: origin?.space, folder: this.root } });
      this.submission = { sent, key, comments };
    } catch (error) {
      notify({ title: "Could not open the send dialog", body: String(error), level: "error" });
    }
    cx.notify();
  }

  finishSubmission(sent, outcome, cx) {
    if (this.submission?.sent !== sent) return;
    const { key, comments } = this.submission;
    this.submission = null;
    const results = { ...(shared(SENT) ?? {}) };
    delete results[sent];
    setShared(SENT, results);
    if (typeof outcome === "number") {
      const submitted = new Map(comments.map(item => [item.id, JSON.stringify(item)]));
      this.setComments(key, this.comments(key).filter(item => submitted.get(item.id) !== JSON.stringify(item)));
    }
    cx.notify();
  }

  button(id, label, action, t) {
    return div().id(id).px(8).py(5).rounded(5).bg(t.raised).text_size(11)
      .cursor_pointer().hover(s => s.bg(t.hover)).on_click(action).child(label);
  }

  documentView(t) {
    const comments = this.comments().filter(item => item.path === this.file);
    return v_flex().id("reviewer-document").flex_1().min_h(0).overflow_y_scrollbar().p(10).gap(10)
      .on_size_change((size, cx) => {
        const next = Math.max(1, size.width - 44);
        if (next !== this.documentWidth) { this.documentWidth = next; cx.notify(); }
      })
      .children(this.document.map(block => {
        const id = `block-${block.start}`, showSource = this.openSource.has(block.start);
        const graphic = block.image;
        const width = Math.min(graphic?.width ?? 0, this.documentWidth ?? 300);
        const preview = block.kind === "metadata" ? TextView.markdown(id, "~~~yaml\n" + block.body + "\n~~~") :
          block.kind === "markdown" ? TextView.markdown(id, block.text) :
          graphic && !showSource ? image(graphic.asset).w(width).h(width * graphic.height / graphic.width).flex_none() :
          TextView.markdown(id, block.text);
        const draft = this.comment?.block === block ? this.comment : null;
        const attached = comments.filter(item => item.start === block.start && item.source === block.text);
        return v_flex().gap(6).p(8).rounded(7).border_1().border_color(t.border)
          .id(id)
          .child(h_flex().gap(6).items_center()
            .child(div().flex_1().min_w(0).text_size(11).text_color(t.muted)
              .child(block.kind === "metadata" ? "Frontmatter" : block.kind === "mermaid" ? "Mermaid" : `Lines ${block.start}–${block.end}`))
            .when(Boolean(graphic), row => row.child(this.button(`${id}-source`, showSource ? "Diagram" : "Source", (_e, cx) => {
              if (showSource) this.openSource.delete(block.start); else this.openSource.add(block.start);
              cx.notify();
            }, t)))
            .child(this.button(`${id}-comment`, "Comment", (_e, cx) => this.startComment(block, null, cx), t)))
          .child(preview)
          .children(attached.map(item => this.button(item.id, item.note, (_e, cx) => this.startComment(block, item, cx), t)))
          .when(Boolean(draft), row => row.child(Textarea.new(draft.input).w_full()).child(h_flex().gap(6)
            .child(this.button("save-file-comment", "Save comment", (_e, cx) => this.saveComment(cx), t))
            .child(this.button("cancel-file-comment", "Cancel", (_e, cx) => { this.comment = null; cx.notify(); }, t))
            .when(Boolean(draft.existing), actions => actions.child(this.button("remove-file-comment", "Remove", (_e, cx) => {
              this.setComments(this.draftKey(), this.comments().filter(item => item.id !== draft.existing.id));
              this.comment = null; cx.notify();
            }, t)))));
      }));
  }

  rows(prefix, depth, out, t) {
    if (out.length >= TOTAL || depth > 40) return out;
    for (const entry of this.entries.get(prefix) ?? []) {
      if (out.length >= TOTAL) break;
      const path = prefix ? `${prefix}/${entry.name}` : entry.name, open = this.folders.has(path), mark = this.marks[`${this.root}/${path}`];
      out.push(h_flex().id(`file-${path}`).h(28).flex_none().pl(8 + depth * 18).pr(8).gap(7).items_center().rounded(7).cursor_pointer().hover(s => s.bg(t.hover))
        .on_click((_e, cx) => entry.dir ? this.toggle(path, cx) : this.show(path, cx))
        .child(entry.dir ? svg(`mods/reviewer-files/chevron-${open ? "down" : "right"}.svg`).size(12).flex_none().text_color(t.dim) : div().w(12).flex_none())
        .child(svg(`mods/reviewer-files/${entry.dir ? "folder" : "file"}.svg`).size(14).flex_none().text_color(t.muted))
        .child(div().flex_1().min_w(0).truncate().child(entry.name))
        .when(Boolean(mark), el => el.child(div().text_size(11).text_color(mark === "A" ? t.ansi2 : mark === "D" || mark === "U" ? t.ansi1 : t.blocked).child(mark))));
      if (entry.dir && open) this.rows(path, depth + 1, out, t);
    }
    return out;
  }

  render(cx) {
    if (key() !== this.context?.key) this.refresh(cx);
    const sent = this.submission?.sent, outcome = sent ? shared(SENT)?.[sent] : undefined;
    if (outcome !== undefined) cx.timer.after(1, cx => this.finishSubmission(sent, outcome, cx));
    const t = theme(), count = this.comments().length;
    return v_flex().id("files").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .when(Boolean(this.file), el => el.child(div().id("files-back").w(20).cursor_pointer().text_color(t.muted).on_click((_e, cx) => { this.show(null); cx.notify(); }).child("←")))
        .child(div().font_semibold().child("Files"))
        .child(div().flex_1().min_w(0).truncate().text_right().text_size(12).text_color(t.dim).child(this.file ?? this.root?.split(/[\\/]/).pop() ?? "")))
      .when(!this.file, el => el.child(v_flex().id("files-tree").flex_1().min_h(0).overflow_y_scrollbar().p(6).children(this.rows("", 0, [], t))
        .when(Boolean(this.error) || !this.entries.get("")?.length, el => el.child(div().p(8).text_size(12).text_color(t.dim).child(this.error || (this.loading ? "Loading files…" : this.root ? "No files" : "No folder"))))
        .when(this.limited, el => el.child(div().p(8).text_size(11).text_color(t.dim).child("File list limited to 500 entries per folder and 5,000 total")))))
      .when(Boolean(this.document) || count > 0, el => el.child(h_flex().gap(6).px(10).py(5)
        .when(Boolean(this.document), row => row.child(this.button("document-mode", this.source ? "Preview" : "Source", (_e, cx) => {
          this.source = !this.source; cx.notify();
        }, t)))
        .when(count > 0 && !this.submission, row => row.child(this.button("submit-file-review", `Submit review · ${count}`, (_e, cx) => this.submit(cx), t)))))
      .when(Boolean(this.file), el => el.child(this.document && !this.source ? this.documentView(t) :
        this.code ? Editor.new(this.code).flex_1().min_h(0) : div().p(12).text_color(t.dim).child(this.fileError || "Loading file…")));
  }
}
