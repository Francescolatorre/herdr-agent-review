// Key helper for Reviewer: does what the tab bar's Changes button does.
// Bind "mod.open:reviewer-toggle". Opened as an overlay, it shows the
// Reviewer block (selects it in its stack, shows hidden ancestors), or hides
// the panel holding it when Reviewer is already shown, then closes itself.
import { View, div } from "gpui-kit";
import { props, run, layout, closeOverlay } from "herdr";

function trail(node, path) {
  if ((node?.content ?? {}).mod === "reviewer") return [...path, node];
  for (const child of node?.children ?? []) {
    const found = trail(child, [...path, node]);
    if (found) return found;
  }
  return null;
}

function toggle() {
  const path = trail(layout(), []);
  if (!path) return;
  const block = path[path.length - 1], stack = path[path.length - 2];
  const ancestors = path.slice(1, -1);
  const shown = !ancestors.some(n => n.hidden) && (!stack?.active || stack.active === block.id);
  if (shown) {
    const outer = path.length >= 4 ? path[path.length - 3] : stack;
    run("layout.hide", { id: outer.id });
    return;
  }
  if (stack?.id) run("layout.select", { stack: stack.id, child: block.id });
  for (const n of ancestors) if (n.hidden) run("layout.show", { id: n.id });
}

export default class ReviewerToggle extends View {
  constructor(cx) {
    super(cx);
    const overlay = props()?.overlay;
    if (!overlay) return; // not opened as an overlay (e.g. `herdr-app check`)
    try { toggle(); } finally { closeOverlay(overlay); }
  }
  render() { return div(); }
}
