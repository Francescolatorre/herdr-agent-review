import assert from "node:assert/strict";
import test from "node:test";
import { documentBlocks } from "../mods/reviewer-files/document.js";
import { diagram } from "../mods/reviewer-files/diagram.js";

test("a committed plan's frontmatter and Mermaid block keep their source lines", () => {
  const source = [
    "---", "title: Plan", "---", "", "# Steps", "",
    "~~~mermaid", "flowchart LR", " A --> B", "~~~", "", "Follow up.",
  ].join("\r\n");
  const [metadata, intro, mermaid, conclusion] = documentBlocks(source);
  assert.deepEqual([metadata.kind, metadata.start, metadata.end], ["metadata", 1, 3]);
  assert.equal(intro.kind, "markdown");
  assert.deepEqual([mermaid.kind, mermaid.start, mermaid.end], ["mermaid", 7, 10]);
  assert.equal(mermaid.body, "flowchart LR\n A --> B");
  assert.equal(conclusion.text.trim(), "Follow up.");
});

test("a Mermaid example inside a longer non-Mermaid fence stays prose", () => {
  const source = ["````md", "```mermaid", "graph LR", " A --> B", "```", "````"].join("\n");
  assert.deepEqual(documentBlocks(source).map(block => block.kind), ["markdown"]);
});

test("flowchart SVG has concrete colors and no remote stylesheet", () => {
  const graphic = diagram("flowchart LR\n A[Plan] --> B[Review]", { foreground: "#123456" });
  assert.ok(graphic.width > 0 && graphic.height > 0);
  assert.match(graphic.svg, /Plan/);
  assert.match(graphic.svg, /#123456/);
  assert.doesNotMatch(graphic.svg, /@import|var\(--/);
  assert.equal(diagram("gantt\n title Plan", {}), null);
});
