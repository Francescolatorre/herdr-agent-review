// Mermaid diagram -> SVG for the document view. The renderer (renderer.bundle.js, built by
// scripts/build-mermaid.mjs) is synchronous and runs locally; nothing leaves the machine.
import { renderMermaidSVG } from "./renderer.bundle.js";

export const MAX_SOURCE = 6000;
export const MAX_SVG = 200000;
const TYPES = /^(?:graph|flowchart|stateDiagram(?:-v2)?|sequenceDiagram|classDiagram|erDiagram|xychart(?:-beta)?)\b/;
const color = (value, fallback) => /^#[\da-f]{6}$/i.test(value ?? "") ? value : fallback;

/** `{ svg, width, height }`, or null when the diagram is not a supported type, too big, or has no size. Throws on a syntax error. */
export function diagram(source, theme) {
  const header = source.split(/\r?\n/).find((line) => line.trim() && !line.trim().startsWith("%%"));
  if (source.length > MAX_SOURCE || !TYPES.test(header?.trim() ?? "")) return null;
  const bg = color(theme.background, "#ffffff");
  const fg = color(theme.foreground, "#242424");
  const accent = color(theme.accent, fg);
  const border = color(theme.border, fg);
  const surface = color(theme.raised, bg);
  const muted = color(theme.muted, fg);
  const colors = {
    bg, fg, accent, border, surface, muted, line: border,
    _text: fg, "_text-sec": muted, "_text-muted": muted, "_text-faint": muted,
    _line: fg, _arrow: accent, "_node-fill": surface, "_node-stroke": border,
    "_group-fill": bg, "_group-hdr": surface, "_inner-stroke": border, "_key-badge": surface,
  };
  const rendered = renderMermaidSVG(source, { bg, fg, accent, border, surface, muted, transparent: true });
  const view = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(rendered);
  if (!view || Number(view[1]) <= 0 || Number(view[2]) <= 0) return null;
  // GPUI rasterizes SVG without browser CSS variables or remote fonts.
  const svg = rendered.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/(<svg\s[^>]*?)\sstyle="[^"]*"/, "$1")
    .replace(/var\(--([\w-]+)\)/g, (_match, key) => colors[key] ?? fg)
    .replace("<svg ", '<svg font-family="sans-serif" ');
  if (svg.length > MAX_SVG) return null;
  return { svg, width: Number(view[1]), height: Number(view[2]) };
}

export function imageKey(svg) {
  let first = 2166136261, second = 5381;
  for (let i = 0; i < svg.length; i++) {
    const code = svg.charCodeAt(i);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second, 33) ^ code;
  }
  return `${first >>> 0}-${second >>> 0}-${svg.length}`;
}
