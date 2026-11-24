// A diagram on its own, big: opened on demand from a Mermaid block ("Pop out"). It is a second
// copy of the panel running as an overlay (like the send dialog), so it only gets what its props
// carry: the cached SVG's asset path, its size and a title.
// The picture is moved with the hand: drag it, or use the wheel or trackpad. There is no scroll
// area to drive, so the picture sits in a clipped box at an offset kept here.
import { div, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, closeOverlay } from "herdr";

const clamp = (value, low, high) => Math.min(Math.max(value, low), Math.max(low, high));

export class DiagramViewer {
  init(spec, overlay) {
    this.spec = spec; this.overlay = overlay; this.actual = true; this.view = null;
    this.x = 0; this.y = 0; this.drag = null;
  }

  // The picture's width on screen: unscaled, or fitted to the box.
  shownWidth() {
    const { width } = this.spec;
    return this.actual || !this.view ? width : Math.min(width, this.view.width);
  }

  // Moves the picture by (dx, dy) screen pixels, never past its edges.
  pan(dx, dy) {
    const { width, height } = this.spec, w = this.shownWidth(), h = w * height / width;
    this.x = clamp(this.x + dx, 0, w - (this.view?.width ?? 0));
    this.y = clamp(this.y + dy, 0, h - (this.view?.height ?? 0));
  }

  render(cx) {
    const t = theme(), { asset, width, height, title } = this.spec;
    const link = (id, label, action) => div().id(id).h(26).px(10).flex().items_center().rounded(6).text_size(12).text_color(t.dim).cursor_pointer()
      .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_click(action).child(label);
    const w = this.shownWidth(), h = w * height / width, room = this.view ?? { width: 0, height: 0 };
    const movable = w > room.width || h > room.height;
    this.pan(0, 0);
    // A picture smaller than the box sits in its middle.
    const left = w <= room.width ? (room.width - w) / 2 : -this.x, top = h <= room.height ? (room.height - h) / 2 : -this.y;
    const box = div().id("viewer-view").flex_1().min_h(0).min_w(0).relative().overflow_hidden()
      .on_size_change((size, cx) => {
        if (size.width !== this.view?.width || size.height !== this.view?.height) { this.view = { width: size.width, height: size.height }; this.pan(0, 0); cx.notify(); }
      })
      .when(movable, (e) => (this.drag ? e.cursor_grabbing() : e.cursor_grab())
        .on_mouse_down("left", (ev, cx) => { this.drag = { x: ev.position.x, y: ev.position.y }; cx.notify(); })
        .on_mouse_move((ev, cx) => {
          if (!this.drag) return;
          this.pan(this.drag.x - ev.position.x, this.drag.y - ev.position.y);
          this.drag = { x: ev.position.x, y: ev.position.y };
          cx.notify();
        })
        .on_mouse_up("left", (_ev, cx) => { this.drag = null; cx.notify(); })
        .on_scroll_wheel((ev, cx) => { this.pan(-ev.delta.x, -ev.delta.y); cx.notify(); }))
      .child(image(asset).absolute().left(left).top(top).w(w).h(h));
    return v_flex().size_full().bg(t.background).text_color(t.foreground)
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().flex_1().min_w(0).truncate().font_semibold().child(title ?? "Diagram"))
        .child(div().text_size(11).text_color(t.dim).child(movable ? "Drag to move" : ""))
        .when(width > room.width, (row) => row.child(link("viewer-size", this.actual ? "Fit" : "Actual size", (_e, cx) => { this.actual = !this.actual; this.x = 0; this.y = 0; cx.notify(); })))
        .child(link("viewer-close", "Close", () => closeOverlay(this.overlay))))
      .child(box);
  }
}
