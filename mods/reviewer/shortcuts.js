import { div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { keys } from "herdr";

const actions = [
  ["mod.open:reviewer-toggle", "Show or hide Reviewer"],
  ["reviewer.shortcuts", "Show or hide shortcuts"],
  ["reviewer.scope", "Cycle comparison"],
  ["reviewer.pr", "Open a pull or merge request"],
  ["reviewer.ask", "Ask about the open file"],
  ["reviewer.submit", "Review draft comments"],
  ["reviewer.clear", "Discard draft comments"],
  ["reviewer.full", "Toggle unchanged lines"],
  ["reviewer.send", "Send from the dialog"],
  ["reviewer.close", "Close the send dialog"],
];

export function shortcutsPanel(t, handle, close) {
  const row = (binding, text) => h_flex().gap(8).py(3).items_center()
    .child(div().flex_1().min_w(0).child(text))
    .child(div().px(5).py(2).rounded(4).bg(t.raised).text_size(11).child(binding));
  const heading = label => div().pt(8).pb(3).font_semibold().child(label);
  const bindings = keys();
  const configured = actions.flatMap(([action, label]) => bindings.filter(k => k.action === action)
    .map(k => row(k.keys, k.section === "global" ? label : `${label} (${k.section})`)));
  return v_flex().id("reviewer-shortcuts").size_full().min_h(0).bg(t.background)
    .text_color(t.foreground).text_size(13).track_focus(handle)
    .on_key_down((e, cx) => {
      if (e.key === "escape" || (e.key === "f1" && !e.modifiers?.control && !e.modifiers?.shift)) { cx.stop_propagation(); close(cx); }
    })
    .child(h_flex().flex_none().px(12).h(40).gap(6).items_center().border_b(1).border_color(t.border)
      .child(div().flex_1().font_semibold().child("Keyboard shortcuts"))
      .child(div().id("shortcuts-close").px(8).py(4).cursor_pointer().rounded(5).bg(t.raised)
        .on_click((_e, cx) => close(cx)).child("Close · Esc")))
    .child(v_flex().id("shortcut-list").flex_1().min_h(0).overflow_y_scrollbar().px(12).pb(10)
      .child(heading("Reviewer"))
      .child(row("F1", "Show help with Reviewer focused"))
      .children(configured)
      .child(heading("Writing a comment"))
      .child(row("Enter", "Save comment"))
      .child(row("Shift + Enter", "Insert a new line"))
      .child(row("Esc", "Cancel editing"))
      .child(heading("Send dialog"))
      .child(row("Ctrl / Cmd + Enter", "Send to the selected agent"))
      .child(row("Esc", "Close dialog")));
}
