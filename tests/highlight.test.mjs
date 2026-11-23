// Tests for mods/reviewer/highlight.js, the diff tokenizer. Run with
// `node --test` from the repo root (Node 18 or newer, no packages; it finds
// every *.test.mjs file itself). highlight.js has no
// imports, so it is loaded through a data: URL; that works whatever
// "type" the surrounding package says, which the mod folder doesn't set.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const file = fileURLToPath(new URL("../mods/reviewer/highlight.js", import.meta.url));
const { languageOf, tokenize } = await import(
  "data:text/javascript;base64," + readFileSync(file).toString("base64")
);

const joined = (spans) => spans.map((s) => s.text).join("");
const pairs = (text, lang) => tokenize(text, lang, null).spans.map((s) => [s.text, s.cls]);

test("languageOf maps extensions to a tokenizer language", () => {
  const cases = {
    "src/a.ts": "js", "a.tsx": "js", "a.mjs": "js", "a.rs": "rust", "a.py": "python",
    "a.go": "go", "a.c": "c", "a.hpp": "c", "a.java": "java", "a.kt": "java",
    "a.rb": "ruby", "a.php": "php", "a.sh": "sh", "a.sql": "sql", "a.scss": "css",
    "a.html": "html", "a.vue": "html", "a.yml": "yaml", "a.toml": "yaml",
    "a.json": "json", "a.swift": "swift",
  };
  for (const [path, lang] of Object.entries(cases)) assert.equal(languageOf(path), lang, path);
});

test("languageOf handles Dockerfile, Makefile, case and paths", () => {
  assert.equal(languageOf("Dockerfile"), "sh");
  assert.equal(languageOf("build/Makefile"), "sh");
  assert.equal(languageOf("dir.d/A.JS"), "js");
});

test("languageOf gives no language to files it doesn't know", () => {
  for (const path of ["LICENSE", "a.unknown", "dir.js/README", "", undefined, null]) {
    assert.equal(languageOf(path), null, String(path));
  }
});

test("Markdown files get colors", { todo: "issue #4: md is not in the extension table yet" }, () => {
  assert.equal(languageOf("README.md"), "markdown");
});

test("an unknown language returns the text as one plain span", () => {
  assert.deepEqual(tokenize("anything at all", null, null), { spans: [{ text: "anything at all", cls: "" }], state: null });
  assert.deepEqual(tokenize("x", "klingon", null).spans, [{ text: "x", cls: "" }]);
});

test("an empty line has no spans and no state", () => {
  assert.deepEqual(tokenize("", "js", null), { spans: [], state: null });
});

test("js: keywords, numbers and comments", () => {
  const got = pairs("const x = 42; // hi", "js");
  assert.deepEqual(got[0], ["const", "keyword"]);
  assert.ok(got.some(([t, c]) => t === "42" && c === "number"));
  assert.deepEqual(got.at(-1), ["// hi", "comment"]);
});

test("js: functions, types, booleans and this", () => {
  const cls = (text, word) => pairs(text, "js").find(([t]) => t === word)?.[1];
  assert.equal(cls("run(1)", "run"), "function");
  assert.equal(cls("new Foo()", "Foo"), "function");
  assert.equal(cls("let a: Foo", "Foo"), "type");
  assert.equal(cls("x = true", "true"), "boolean");
  assert.equal(cls("this.a", "this"), "variable");
});

test("js: a string keeps its escapes inside one string span", () => {
  const got = pairs('x = "a\\nb"', "js");
  assert.deepEqual(got.find(([, c]) => c === "string"), ['"a\\nb"', "string"]);
});

test("js: an unterminated string runs to the end of the line", () => {
  const got = pairs('x = "never closed', "js");
  assert.deepEqual(got.at(-1), ['"never closed', "string"]);
});

test("a block comment carries its state to the next line and ends there", () => {
  const first = tokenize("a /* open", "js", null);
  assert.deepEqual(first.state, { close: "*/", cls: "comment" });
  const mid = tokenize("still inside", "js", first.state);
  assert.deepEqual(mid.spans, [{ text: "still inside", cls: "comment" }]);
  assert.deepEqual(mid.state, first.state);
  const last = tokenize("done */ return", "js", mid.state);
  assert.deepEqual(last.spans[0], { text: "done */", cls: "comment" });
  assert.ok(last.spans.some((s) => s.text === "return" && s.cls === "keyword"));
  assert.equal(last.state, null);
});

test("python: a triple-quoted string spans lines", () => {
  const first = tokenize('s = """doc', "python", null);
  assert.equal(first.state?.close, '"""');
  const last = tokenize('end""" + x', "python", first.state);
  assert.deepEqual(last.spans[0], { text: 'end"""', cls: "string" });
  assert.equal(last.state, null);
});

test("python: # starts a comment, and self is a variable", () => {
  const got = pairs("self.x = 1  # note", "python");
  assert.deepEqual(got[0], ["self", "variable"]);
  assert.deepEqual(got.at(-1), ["# note", "comment"]);
});

test("c: a preprocessor line is one keyword span", () => {
  assert.deepEqual(tokenize("#include <stdio.h>", "c", null).spans, [{ text: "#include <stdio.h>", cls: "keyword" }]);
});

test("yaml: a key is a variable followed by punctuation", () => {
  const got = pairs("name: value", "yaml");
  assert.deepEqual(got[0], ["name", "variable"]);
});

test("html: tags are keywords and attribute values are strings", () => {
  const got = pairs('<div class="a">', "html");
  assert.deepEqual(got[0], ["<div", "keyword"]);
  assert.ok(got.some(([t, c]) => t === '"a"' && c === "string"));
});

test("sql keywords match in any case", () => {
  assert.deepEqual(pairs("SELECT a FROM t", "sql")[0], ["SELECT", "keyword"]);
  assert.deepEqual(pairs("select a from t", "sql")[0], ["select", "keyword"]);
});

test("css: a hex color is a number", () => {
  assert.ok(pairs("color: #1a2b3c;", "css").some(([t, c]) => t === "#1a2b3c" && c === "number"));
});

test("sh: $VAR and ${VAR} are variables", () => {
  const got = pairs('echo "$A" $B ${C}', "sh");
  assert.ok(got.some(([t, c]) => t === "$B" && c === "variable"));
  assert.ok(got.some(([t, c]) => t === "${C}" && c === "variable"));
});

test("a very long line is cut at 600 characters without losing text", () => {
  const long = "a".repeat(5000);
  const { spans } = tokenize(long, "js", null);
  assert.equal(joined(spans), long);
  assert.ok(spans.length <= 3, "a long plain run stays a handful of spans");
});

test("a row stays a few elements however many tokens it has", () => {
  const busy = Array.from({ length: 200 }, (_, i) => (i % 2 ? "x" : "1") + "(").join(" ");
  const { spans } = tokenize(busy, "js", null);
  assert.equal(joined(spans), busy);
  assert.ok(spans.length <= 60, `got ${spans.length} spans`);
});

// The one property the panel depends on: the spans always add up to the line.
test("the spans of every language always add up to the input", () => {
  const exts = ["ts", "rs", "py", "go", "c", "java", "rb", "php", "sh", "sql", "css", "html", "yaml", "json", "swift"];
  const lines = [
    "", " ", "\t\t", "a", "}", "\r", "x\r", "'", '"', "`", "\\", '"\\', "/*", "*/", "<!--", "-->", '"""',
    "=begin", "$", "${", "#", "//", "--", "0x", "1e", "1.2.3", "é ü 😀 日本語", "  indented();",
    "SELECT * FROM t WHERE a = 'x';", "<a href='x'>y</a>", "fn main() { println!(\"hi\"); }",
    "def f(self): return 'a' # c", "key: [1, 2]  # c", "@media (min-width: 1px) { a { color: #fff } }",
    "a".repeat(700), "(".repeat(300), '"'.repeat(301),
  ];
  // A seeded generator, so a failure repeats.
  let seed = 12345;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const alphabet = "ab 1_$#/*-'\"`\\<>=(){}[]:;,.\t\r0xé";
  for (let i = 0; i < 400; i++) {
    lines.push(Array.from({ length: Math.floor(rand() * 40) }, () => alphabet[Math.floor(rand() * alphabet.length)]).join(""));
  }
  for (const ext of exts) {
    const lang = languageOf("f." + ext);
    let state = null;
    for (const line of lines) {
      const out = tokenize(line, lang, state);
      assert.equal(joined(out.spans), line, `${lang}: ${JSON.stringify(line)}`);
      for (const s of out.spans) assert.ok(s.text.length > 0, `${lang}: empty span in ${JSON.stringify(line)}`);
      state = out.state;
    }
  }
});
