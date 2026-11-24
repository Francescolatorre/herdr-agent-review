// A diagram on its own, big: opened on demand from a Mermaid block ("Pop out"). It is a second
// copy of the panel running as an overlay (like the send dialog), so it only gets what its props
// carry: the cached SVG's asset path, its size and a title.
import { div, image } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, closeOverlay } from "herdr";

export class DiagramViewer {
  init(spec, overlay) {
    this.spec = spec; this.overlay = overlay; this.actual = true; this.room = null;
  }

  render(cx) {
    const t = theme(), { asset, width, height, title } = this.spec;
    const link = (id, label, action) => div().id(id).h(26).px(10).flex().items_center().rounded(6).text_size(12).text_color(t.dim).cursor_pointer()
      .hover((s) => s.bg(t.hover).text_color(t.foreground)).on_click(action).child(label);
    // Fitting here may shrink further than in the panel: the point is to see the whole diagram.
    const shown = this.actual || !this.room ? width : Math.min(width, this.room);
    return v_flex().size_full().bg(t.background).text_color(t.foreground)
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().flex_1().min_w(0).truncate().font_semibold().child(title ?? "Diagram"))
        .when(width > (this.room ?? 0), (row) => row.child(link("viewer-size", this.actual ? "Fit" : "Actual size", (_e, cx) => { this.actual = !this.actual; cx.notify(); })))
        .child(link("viewer-close", "Close", () => closeOverlay(this.overlay))))
      .child(div().id("viewer-scroll").flex_1().min_h(0).min_w(0).overflow_scrollbar().p(16)
        .on_size_change((size, cx) => { const room = Math.max(120, Math.floor(size.width - 32)); if (room !== this.room) { this.room = room; cx.notify(); } })
        .child(image(asset).w(shown).h(shown * height / width).flex_none()));
  }
}
