// The pull / merge request dialog of reviewer, an overlay of the same mod:
//   openOverlay({ mod: "reviewer", kind: "dialog", width, height, props: { prDialog: { cwd, on } } })
// (main.js hands the copy over to this class when props().prDialog is set).
// It takes a link or number, opens the request in a worktree (pr.js) and pins the
// panel of its space to it (pins.js: shared "reviewer.pr", one request per space); while one is open it shows the
// request's title, details and description and offers "Close request", which
// takes the worktree away again. Enter opens, Esc closes the dialog.
// Above the box it lists the project's open requests (read in the background when
// the dialog opens, with gh / glab); a click opens one like its number would. The
// filter "Review requested from me" (default) or "All open" is shared "reviewer.prFilter"
// (false = all). Without gh/glab, a login or on any error the list says why and the box still works.
import { div } from "gpui-kit";
import { v_flex, h_flex, TextView, InputState, Input } from "gpui-base";
import { exec, props, closeOverlay, theme, shared, setShared, notify, spaces } from "herdr";
import { log } from "./log.js";
import { openReview, closeReview, listRequests } from "./pr.js";
import { createPins } from "./pins.js";

export const SCOPE = "reviewer.scope", FILTER = "reviewer.prFilter";

// The requests open per space (pins.js, shared "reviewer.pr"): a space's panel reviews its
// request's worktree, other spaces follow their pane as usual.
export const pins = createPins({
  get: shared, set: setShared,
  spaces: () => spaces().map((s) => s.id),
  active: () => spaces().find((s) => s.active)?.id ?? null,
});
// The request open in `space` (default: the active one), or null.
export const pinned = (space) => pins.pinned(space);

export class PrDialog {
  init(_props, cx) {
    const p = props() ?? {};
    this.spec = p.prDialog ?? {}; this.overlay = p.overlay;
    this.space = this.spec.space ?? null; // the space it was opened from: its request is the one shown
    this.busy = null; this.error = null; this.discard = false; this.closed = false; this.text = "";
    this.input = InputState.new({ placeholder: "Link or number: 123, !45 or https://…/pull/123" });
    this.input.on("change", (_e, cx) => { this.text = this.input.value(); this.error = null; cx.notify(); });
    this.input.on("submit", (_e, cx) => this.open(cx));
    this.input.focus();
    this.handle = cx.focus_handle();
    this.list = null; this.listTicket = 0;
    this.loadList(cx);
  }

  dismiss() { this.closed = true; closeOverlay(this.overlay); }
  onRemoved() { this.closed = true; }

  // Where git runs for opening: the repository the pinned request came from, else the panel's folder.
  where() { const p = pinned(this.space); return p ? { cwd: p.repo, on: p.on ?? null } : { cwd: this.spec.cwd, on: this.spec.on ?? null }; }

  // The filter of the list of open requests, remembered: those waiting for my review (the default), or all open.
  mine() { return shared(FILTER) !== false; }

  // Reads the open requests in the background; the dialog stays usable meanwhile. A slower
  // answer to an earlier filter is dropped.
  loadList(cx) {
    const { cwd, on } = this.where(), mine = this.mine(), ticket = ++this.listTicket;
    this.list = { loading: true };
    cx.spawn(async (cx) => {
      let result;
      try { result = await listRequests({ exec, cwd, on, mine }); }
      catch (e) { log("pr.list", e); result = { ok: false, problem: String(e?.message ?? e).slice(0, 200) }; }
      if (this.closed || ticket !== this.listTicket) return;
      this.list = result;
      cx.notify();
    });
    cx.notify();
  }

  setFilter(mine, cx) {
    if (mine === this.mine()) return;
    setShared(FILTER, mine);
    this.loadList(cx);
  }

  open(cx, input = this.text) {
    if (this.busy || this.closed) return;
    const { cwd, on } = this.where();
    if (!cwd) { this.error = "No folder is shown to open a request from."; cx.notify(); return; }
    this.busy = "Fetching the request into a worktree…"; this.error = null; this.discard = false; cx.notify();
    cx.spawn(async (cx) => {
      let result;
      try { result = await openReview({ exec, cwd, on, input }); }
      catch (e) { log("pr.open", e); result = { ok: false, error: String(e?.message ?? e).slice(0, 300) }; }
      if (this.closed) return;
      this.busy = null;
      if (!result.ok) { this.error = result.error; cx.notify(); return; }
      const { pin } = result, previous = pinned(this.space);
      // A different request than before: leave its worktree in place (it may hold the person's notes);
      // the person closes it explicitly. The panel starts on the whole request, as a pull request page does.
      // The request belongs to this space only.
      pins.set(this.space, pin);
      const scopes = { ...(shared(SCOPE) ?? {}) }; scopes[`${pin.on ?? ""}:${pin.root}`] = "branch"; setShared(SCOPE, scopes);
      if (previous && previous.root !== pin.root) log("pr.switch", previous.path);
      this.input.set_value(""); this.text = "";
      notify({ title: `${pin.label} opened`, body: pin.info?.title || pin.path, level: "success" });
      cx.notify();
    });
  }

  close(cx) {
    const pin = pinned(this.space);
    if (!pin || this.busy || this.closed) return;
    const force = this.discard;
    this.busy = "Removing the worktree…"; this.error = null; cx.notify();
    cx.spawn(async (cx) => {
      let result;
      try { result = await closeReview({ exec, pin, force }); }
      catch (e) { log("pr.close", e); result = { ok: false, error: String(e?.message ?? e).slice(0, 300) }; }
      if (this.closed) return;
      this.busy = null;
      if (result.ok) { this.discard = false; pins.set(this.space, null); notify({ title: `${pin.label} closed`, body: "The worktree was removed.", level: "info" }); }
      else if (result.dirty) { this.discard = true; this.error = `${result.error} Close again to discard them.`; }
      else this.error = result.error;
      cx.notify();
    });
  }

  render(cx) {
    const t = theme(), pin = pinned(this.space), info = pin?.info;
    const button = (id, text, primary, action, disabled) => h_flex().id(id).h(32).px(14).items_center().rounded(8).border_1()
      .border_color(primary ? t.solid : t.input).bg(primary ? t.solid : t.raised).text_color(primary ? t.solid_foreground : t.foreground).text_size(12.5).font_medium()
      .when(disabled, (e) => e.opacity(0.5)).when(!disabled, (e) => e.cursor_pointer().hover((s) => s.opacity(0.88)).on_click(action)).child(text);
    const list = this.list, mine = this.mine();
    const chip = (id, text, on, action) => h_flex().id(id).h(22).px(8).items_center().rounded(11).border_1().border_color(on ? t.accent : t.border)
      .bg(on ? t.accent + "22" : t.raised).text_color(on ? t.accent : t.dim).text_size(11).cursor_pointer().hover((s) => s.opacity(0.85)).on_click(action).child(text);
    // One open request: #number, title (with a draft mark), author · branch, review status. A click opens it.
    const row = (r) => h_flex().id(`pr-row-${r.number}`).px(8).py(5).gap(8).items_center().rounded(6)
      .when(!this.busy, (e) => e.cursor_pointer().hover((s) => s.bg(t.hover)).on_click((_e, cx) => this.open(cx, String(r.number))))
      .when(Boolean(this.busy), (e) => e.opacity(0.5))
      .tooltip(`${r.title}\n${r.author}${r.branch ? ` · ${r.branch}` : ""}`)
      .child(div().flex_none().w(44).text_size(11.5).text_color(t.dim).child(`#${r.number}`))
      .when(r.draft, (e) => e.child(div().flex_none().px(5).py(1).rounded(4).bg(t.raised).text_size(10).text_color(t.muted).child("draft")))
      .child(div().flex_1().min_w(0).truncate().text_size(12).child(r.title))
      .child(div().flex_none().max_w(200).truncate().text_size(10.5).text_color(t.dim).child([r.author, r.branch].filter(Boolean).join(" · ")))
      .when(Boolean(r.review), (e) => e.child(div().flex_none().text_size(10.5).text_color(r.review === "approved" ? t.ansi2 : r.review === "changes requested" ? t.ansi1 : t.muted).child(r.review)));
    const meta = info ?[info.author && `by ${info.author}`, info.state, info.base && `into ${info.base}${info.head ? ` from ${info.head}` : ""}`, info.checks].filter(Boolean).join(" · ") : "";
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
      // The open requests of the project: a click opens one, the box below takes any other link or number.
      .child(v_flex().when(!pin, (e) => e.flex_1()).min_h(90).max_h(pin ? 170 : 1000).gap(4)
        .child(h_flex().gap(6).items_center()
          .child(div().text_size(11.5).text_color(t.dim).child("Open requests"))
          .child(div().flex_1())
          .child(chip("pr-filter-mine", "Review requested from me", mine, (_e, cx) => this.setFilter(true, cx)))
          .child(chip("pr-filter-all", "All open", !mine, (_e, cx) => this.setFilter(false, cx))))
        .child(v_flex().id("pr-list").flex_1().min_h(0).overflow_y_scrollbar().gap(1).rounded(8).border_1().border_color(t.border).bg(t.background).p(4)
          .when(!list || list.loading, (e) => e.child(div().px(8).py(6).text_size(11.5).text_color(t.dim).child("Loading open requests…")))
          .when(Boolean(list && !list.loading && !list.ok), (e) => e.child(div().px(8).py(6).text_size(11.5).text_color(t.blocked).whitespace_normal().child(`${list.problem} You can still enter a link or number below.`)))
          .when(Boolean(list?.ok && !list.items.length), (e) => e.child(div().px(8).py(6).text_size(11.5).text_color(t.dim).whitespace_normal().child(mine ? "Nothing is waiting for your review. Switch to All open, or enter a link or number below." : "No open requests.")))
          .children(list?.ok ? list.items.map((r) => row(r)) : [])))
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
