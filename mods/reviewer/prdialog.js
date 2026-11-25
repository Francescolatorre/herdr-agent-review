// The pull / merge request dialog of reviewer, an overlay of the same mod:
//   openOverlay({ mod: "reviewer", kind: "dialog", width, height, props: { prDialog: { cwd, on } } })
// (main.js hands the copy over to this class when props().prDialog is set).
// It takes a link or number, opens the request in a worktree (pr.js) and pins the
// panel to it through shared "reviewer.pr"; while one is open it shows the
// request's title, details and description and offers "Close request", which
// takes the worktree away again. Enter opens, Esc closes the dialog.
import { div } from "gpui-kit";
import { v_flex, h_flex, TextView, InputState, Input } from "gpui-base";
import { exec, props, closeOverlay, theme, shared, setShared, notify } from "herdr";
import { log } from "./log.js";
import { openReview, closeReview } from "./pr.js";

export const PR = "reviewer.pr", SCOPE = "reviewer.scope";

// The open request, if any (and well-formed): the panel reviews its worktree.
export const pinned = () => { const p = shared(PR); return p && typeof p === "object" && typeof p.root === "string" ? p : null; };

export class PrDialog {
  init(_props, cx) {
    const p = props() ?? {};
    this.spec = p.prDialog ?? {}; this.overlay = p.overlay;
    this.busy = null; this.error = null; this.discard = false; this.closed = false; this.text = "";
    this.input = InputState.new({ placeholder: "Link or number: 123, !45 or https://…/pull/123" });
    this.input.on("change", (_e, cx) => { this.text = this.input.value(); this.error = null; cx.notify(); });
    this.input.on("submit", (_e, cx) => this.open(cx));
    this.input.focus();
    this.handle = cx.focus_handle();
  }

  dismiss() { this.closed = true; closeOverlay(this.overlay); }
  onRemoved() { this.closed = true; }

  // Where git runs for opening: the repository the pinned request came from, else the panel's folder.
  where() { const p = pinned(); return p ? { cwd: p.repo, on: p.on ?? null } : { cwd: this.spec.cwd, on: this.spec.on ?? null }; }

  open(cx) {
    if (this.busy || this.closed) return;
    const { cwd, on } = this.where(), input = this.text;
    if (!cwd) { this.error = "No folder is shown to open a request from."; cx.notify(); return; }
    this.busy = "Fetching the request into a worktree…"; this.error = null; this.discard = false; cx.notify();
    cx.spawn(async (cx) => {
      let result;
      try { result = await openReview({ exec, cwd, on, input }); }
      catch (e) { log("pr.open", e); result = { ok: false, error: String(e?.message ?? e).slice(0, 300) }; }
      if (this.closed) return;
      this.busy = null;
      if (!result.ok) { this.error = result.error; cx.notify(); return; }
      const { pin } = result, previous = pinned();
      // A different request than before: leave its worktree in place (it may hold the person's notes);
      // the person closes it explicitly. The panel starts on the whole request, as a pull request page does.
      setShared(PR, pin);
      const scopes = { ...(shared(SCOPE) ?? {}) }; scopes[`${pin.on ?? ""}:${pin.root}`] = "branch"; setShared(SCOPE, scopes);
      if (previous && previous.root !== pin.root) log("pr.switch", previous.path);
      this.input.set_value(""); this.text = "";
      notify({ title: `${pin.label} opened`, body: pin.info?.title || pin.path, level: "success" });
      cx.notify();
    });
  }

  close(cx) {
    const pin = pinned();
    if (!pin || this.busy || this.closed) return;
    const force = this.discard;
    this.busy = "Removing the worktree…"; this.error = null; cx.notify();
    cx.spawn(async (cx) => {
      let result;
      try { result = await closeReview({ exec, pin, force }); }
      catch (e) { log("pr.close", e); result = { ok: false, error: String(e?.message ?? e).slice(0, 300) }; }
      if (this.closed) return;
      this.busy = null;
      if (result.ok) { this.discard = false; setShared(PR, null); notify({ title: `${pin.label} closed`, body: "The worktree was removed.", level: "info" }); }
      else if (result.dirty) { this.discard = true; this.error = `${result.error} Close again to discard them.`; }
      else this.error = result.error;
      cx.notify();
    });
  }

  render(cx) {
    const t = theme(), pin = pinned(), info = pin?.info;
    const button = (id, text, primary, action, disabled) => h_flex().id(id).h(32).px(14).items_center().rounded(8).border_1()
      .border_color(primary ? t.solid : t.input).bg(primary ? t.solid : t.raised).text_color(primary ? t.solid_foreground : t.foreground).text_size(12.5).font_medium()
      .when(disabled, (e) => e.opacity(0.5)).when(!disabled, (e) => e.cursor_pointer().hover((s) => s.opacity(0.88)).on_click(action)).child(text);
    const meta = info ? [info.author && `by ${info.author}`, info.state, info.base && `into ${info.base}${info.head ? ` from ${info.head}` : ""}`, info.checks].filter(Boolean).join(" · ") : "";
    return v_flex().id("pr-dialog").track_focus(this.handle)
      .on_key_down((e, cx) => { if (e.key === "escape") { this.dismiss(); cx.stop_propagation(); } })
      .size_full().min_h(0).p(18).gap(10).bg(t.popover).text_color(t.foreground).text_size(13)
      .child(h_flex().items_center().gap(8)
        .child(div().text_size(15).font_semibold().child("Pull / merge request"))
        .child(div().flex_1())
        .child(div().text_size(11).text_color(t.dim).child("Esc")))
      .when(Boolean(pin), (el) => el.child(v_flex().flex_1().min_h(120).gap(6)
        .child(h_flex().gap(8).items_center()
          .child(div().flex_none().px(7).py(2).rounded(5).bg(t.raised).text_size(11.5).font_semibold().child(pin.label))
          .child(div().flex_1().min_w(0).text_size(14).font_semibold().whitespace_normal().child(info?.title || "(no title: gh or glab is missing)")))
        .when(Boolean(meta), (e) => e.child(div().text_size(11.5).text_color(t.dim).whitespace_normal().child(meta)))
        .when(Boolean(info?.labels?.length), (e) => e.child(div().text_size(11).text_color(t.muted).whitespace_normal().child(`Labels: ${info.labels.join(", ")}`)))
        .child(div().id("pr-body").flex_1().min_h(0).p(10).rounded(8).border_1().border_color(t.border).bg(t.background).overflow_y_scrollbar()
          .child(info?.body?.trim() ? TextView.markdown("pr-description", info.body) : div().text_size(12).text_color(t.dim).child(info ? "No description." : "The description needs `gh` (GitHub) or `glab` (GitLab), installed and logged in.")))
        .children((pin.notes ?? []).map((n) => div().text_size(11).text_color(t.blocked).whitespace_normal().child(n)))
        .child(div().text_size(11).text_color(t.dim).whitespace_normal().child(`Worktree ${pin.path} at ${pin.sha} · compared with origin/${pin.base} · your own checkout is untouched`))))
      .when(!pin, (el) => el.child(div().text_size(12).text_color(t.dim).whitespace_normal().child("Opens the request's code in a separate worktree and shows everything it changes against its target branch, with its description when gh or glab is available. Nothing is pushed or posted.")))
      .child(h_flex().gap(8).items_center()
        .child(div().id("pr-input").flex_1().min_w(0).h(32).px(10).flex().items_center().rounded(8).border_1().border_color(t.input).bg(t.background).cursor_text()
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation()).child(Input.new(this.input).h_full().text_size(12.5).text_color(t.foreground)))
        .child(button("pr-open", pin ? "Open another" : "Open", true, (_e, cx) => this.open(cx), Boolean(this.busy) || !this.text.trim())))
      .when(Boolean(this.busy), (el) => el.child(div().text_size(11.5).text_color(t.dim).child(this.busy)))
      .when(Boolean(this.error), (el) => el.child(div().text_size(11.5).text_color(t.ansi1).whitespace_normal().child(this.error)))
      .child(h_flex().gap(8).items_center()
        .child(div().flex_1())
        .when(Boolean(pin), (e) => e.child(button("pr-close-request", this.discard ? "Discard changes and close" : "Close request", false, (_e, cx) => this.close(cx), Boolean(this.busy))))
        .child(button("pr-done", "Done", false, () => this.dismiss(), false)));
  }
}
