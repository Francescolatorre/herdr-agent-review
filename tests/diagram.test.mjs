import assert from "node:assert/strict";
import test from "node:test";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diagram, imageKey } from "../mods/reviewer/diagram.js";
import { createDiagramCache, LIMIT } from "../mods/reviewer/diagram-cache.js";

test("the renderer bundle loads where there is no window, self or document (as in Herdr)", () => {
  for (const name of ["window", "self", "document"]) assert.equal(typeof globalThis[name], "undefined");
  assert.ok(diagram("flowchart LR\n A --> B", {}).width > 0);
});

test("flowchart SVG has concrete colors and no remote stylesheet", () => {
  const graphic = diagram("flowchart LR\n A[Plan] --> B[Review]", { foreground: "#123456" });
  assert.ok(graphic.width > 0 && graphic.height > 0);
  assert.match(graphic.svg, /Plan/);
  assert.match(graphic.svg, /#123456/);
  assert.doesNotMatch(graphic.svg, /@import|var\(--|<style/);
});

test("sequence, class and state diagrams render; other types and oversize sources fall back", () => {
  assert.ok(diagram("sequenceDiagram\n A->>B: hi", {}));
  assert.ok(diagram("classDiagram\n class A", {}));
  assert.ok(diagram("stateDiagram-v2\n [*] --> A", {}));
  assert.equal(diagram("gantt\n title Plan", {}), null);
  assert.equal(diagram("%% note\n\n", {}), null);
  assert.equal(diagram("flowchart LR\n" + " A --> B\n".repeat(1000), {}), null);
});

test("a diagram with nothing to draw falls back to source", () => {
  assert.equal(diagram("flowchart LR\n", {}), null);
  assert.equal(diagram("sequenceDiagram\n garbage line here", {}), null);
});

test("the same diagram has the same key, a different one does not", () => {
  const a = diagram("flowchart LR\n A --> B", {}).svg, b = diagram("flowchart LR\n A --> C", {}).svg;
  assert.equal(imageKey(a), imageKey(a));
  assert.notEqual(imageKey(a), imageKey(b));
});

test("the diagram cache keeps at most LIMIT real files and empties the older ones", async (t) => {
  const home = mkdtempSync(join(tmpdir(), "reviewer-cache-"));
  t.after(() => rmSync(home, { recursive: true, force: true }));
  const dir = join(home, "data/reviewer-mermaid");
  // Like Herdr's writeTextFile: replaces only when the old text still matches; creates folders.
  const host = {
    appHome: () => home,
    readTextFile: async (path) => existsSync(path) ? readFileSync(path, "utf8") : null,
    writeTextFile: async (path, text, expected) => {
      const now = existsSync(path) ? readFileSync(path, "utf8") : null;
      if (now !== expected) throw new Error("stale");
      (await import("node:fs")).mkdirSync(join(path, ".."), { recursive: true });
      writeFileSync(path, text);
    },
  };
  const store = createDiagramCache(host);
  const svg = (n) => `<svg viewBox="0 0 9 9">${"x".repeat(200)}${n}</svg>`;
  const first = await store("k0", svg(0));
  assert.equal(first, "data/reviewer-mermaid/k0.svg");
  await Promise.all(Array.from({ length: LIMIT + 5 }, (_, i) => store(`k${i + 1}`, svg(i + 1))));
  const full = readdirSync(dir).filter((f) => f.endsWith(".svg") && readFileSync(join(dir, f), "utf8").length > 100);
  assert.equal(full.length, LIMIT);
  assert.ok(readFileSync(join(dir, "k0.svg"), "utf8").length < 100, "the oldest file was emptied");
  assert.equal(JSON.parse(readFileSync(join(dir, "index.json"), "utf8")).length, LIMIT);
  await store(`k${LIMIT + 5}`, svg(LIMIT + 5)); // storing a known key again does not grow the index
  assert.equal(JSON.parse(readFileSync(join(dir, "index.json"), "utf8")).length, LIMIT);
});
