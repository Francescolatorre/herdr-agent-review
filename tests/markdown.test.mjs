import assert from "node:assert/strict";
import test from "node:test";
import { documentBlocks, isMarkdown } from "../mods/reviewer/markdown.js";

const shape = (source) => documentBlocks(source).map((b) => [b.kind, b.start, b.end]);

test("frontmatter, prose and a Mermaid fence keep their lines in the file (CRLF too)", () => {
  const source = ["---", "title: Plan", "---", "", "# Steps", "", "~~~mermaid", "flowchart LR", " A --> B", "~~~", "", "Follow up."].join("\r\n");
  assert.deepEqual(shape(source), [["metadata", 1, 3], ["markdown", 5, 5], ["mermaid", 7, 10], ["markdown", 12, 12]]);
  const [metadata, , mermaid] = documentBlocks(source);
  assert.equal(metadata.body, "title: Plan");
  assert.equal(mermaid.body, "flowchart LR\n A --> B");
});

test("blocks start at their first and end at their last non-blank line", () => {
  assert.deepEqual(shape("\n\nFirst\n\n\nSecond\nline\n\n"), [["markdown", 3, 3], ["markdown", 6, 7]]);
});

test("a heading with its paragraph below stays one block, a blank line splits", () => {
  assert.deepEqual(shape("# Title\nText\n\nNext"), [["markdown", 1, 2], ["markdown", 4, 4]]);
});

test("a code fence with blank lines inside is one block", () => {
  const source = ["Intro", "", "```js", "a();", "", "b();", "```", "", "Outro"].join("\n");
  assert.deepEqual(shape(source), [["markdown", 1, 1], ["markdown", 3, 7], ["markdown", 9, 9]]);
});

test("a Mermaid example inside a longer non-Mermaid fence stays prose", () => {
  const source = ["````md", "```mermaid", "graph LR", " A --> B", "```", "````"].join("\n");
  assert.deepEqual(documentBlocks(source).map((b) => b.kind), ["markdown"]);
});

test("an unterminated Mermaid fence runs to the end of the file", () => {
  assert.deepEqual(shape("Text\n\n```mermaid\ngraph LR\n A --> B"), [["markdown", 1, 1], ["mermaid", 3, 5]]);
});

test("frontmatter may have trailing blanks on its delimiter lines; a lone --- is not frontmatter", () => {
  assert.deepEqual(shape("--- \nkey: v\n---  \nText"), [["metadata", 1, 3], ["markdown", 4, 4]]);
  assert.deepEqual(documentBlocks("---\nno end\n").map((b) => b.kind), ["markdown"]);
});

test("a table and the list items around it are separate blocks", () => {
  const source = ["- one", "", "| a | b |", "|---|---|", "| 1 | 2 |", "", "- two"].join("\n");
  assert.deepEqual(shape(source), [["markdown", 1, 1], ["markdown", 3, 5], ["markdown", 7, 7]]);
});

test("an empty or blank file has no blocks", () => {
  assert.deepEqual(documentBlocks(""), []);
  assert.deepEqual(documentBlocks("\n\n  \n"), []);
});

test("every block's text is exactly the lines it claims", () => {
  const source = ["---", "a: 1", "---", "", "Intro", "", "```mermaid", "graph TD", "```", "", "- x", "- y"].join("\n");
  const lines = source.split("\n");
  for (const b of documentBlocks(source)) assert.equal(b.text, lines.slice(b.start - 1, b.end).join("\n"));
});

test("only .md and .markdown files get the document view", () => {
  assert.ok(isMarkdown("docs/PLAN.md") && isMarkdown("A.MARKDOWN"));
  assert.ok(!isMarkdown("notes.mdx") && !isMarkdown("md") && !isMarkdown(null));
});
