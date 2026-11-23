// Splits a Markdown file into blocks a reviewer can read as a document and comment
// on one by one. Every block keeps its line range in the original file, so a
// comment on a block is an ordinary line comment (the same `from`/`to` numbers and
// `quote` as one made on the source lines) and shows up in the source view too.
//
// Kinds: "metadata" (YAML frontmatter, `body` without the --- lines), "mermaid"
// (a Mermaid fence, `body` is the diagram source) and "markdown" (everything else:
// one paragraph, heading, list item, table or code fence per block).
// Not recognised: a fence inside an indented list item stays part of its text.
export const MAX_BLOCKS = 500;

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([^\s`]*)/;

export function documentBlocks(source) {
  const lines = String(source).split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  const blocks = [];
  // [from, to) in zero-based lines; blank lines at either end are not part of a block.
  const add = (kind, from, to, body) => {
    while (from < to && !lines[from].trim()) from++;
    while (to > from && !lines[to - 1].trim()) to--;
    if (from < to) blocks.push({ kind, start: from + 1, end: to, text: lines.slice(from, to).join("\n"), body });
  };
  // Prose from..to, cut at blank lines that are not inside a code fence.
  const prose = (from, to) => {
    let begin = from, open = null;
    for (let i = from; i < to; i++) {
      const fence = FENCE.exec(lines[i]);
      if (open) {
        const closing = /^ {0,3}(`+|~+)\s*$/.exec(lines[i])?.[1];
        if (closing && closing[0] === open[0] && closing.length >= open.length) open = null;
      } else if (fence) {
        open = fence[1];
      } else if (!lines[i].trim()) {
        add("markdown", begin, i);
        begin = i + 1;
      }
    }
    add("markdown", begin, to);
  };
  let start = 0;
  if (/^---\s*$/.test(lines[0] ?? "")) {
    const end = lines.findIndex((line, i) => i > 0 && /^(---|\.\.\.)\s*$/.test(line));
    if (end > 0) {
      add("metadata", 0, end + 1, lines.slice(1, end).join("\n"));
      start = end + 1;
    }
  }
  let from = start;
  for (let i = start; i < lines.length; i++) {
    const fence = FENCE.exec(lines[i]);
    if (!fence) continue;
    const marker = fence[1][0], length = fence[1].length;
    let end = i + 1;
    while (end < lines.length) {
      const closing = /^ {0,3}(`+|~+)\s*$/.exec(lines[end])?.[1];
      if (closing && closing[0] === marker && closing.length >= length) break;
      end++;
    }
    if (fence[2].toLowerCase() === "mermaid") {
      prose(from, i);
      add("mermaid", i, Math.min(end + 1, lines.length), lines.slice(i + 1, end).join("\n"));
      from = end + 1;
    }
    i = end;
  }
  prose(from, lines.length);
  return blocks;
}

/** True for the files that get the document view. */
export const isMarkdown = (path) => /\.(md|markdown)$/i.test(String(path ?? ""));
