// Keep offsets in the original file, including fence delimiters and frontmatter.
export function documentBlocks(source) {
  const lines = source.split(/\r?\n/);
  const blocks = [];
  const add = (kind, start, end, body) => {
    const text = lines.slice(start, end).join("\n");
    if (text.trim()) blocks.push({ kind, start: start + 1, end, text, body });
  };
  let start = 0;
  if (lines[0] === "---") {
    const end = lines.findIndex((line, i) => i > 0 && /^(---|\.\.\.)$/.test(line));
    if (end > 0) {
      add("metadata", 0, end + 1, lines.slice(1, end).join("\n"));
      start = end + 1;
    }
  }
  let prose = start;
  for (let i = start; i < lines.length; i++) {
    const fence = /^ {0,3}(`{3,}|~{3,})\s*([^\s]*)/.exec(lines[i]);
    if (!fence) continue;
    const marker = fence[1][0], length = fence[1].length;
    let end = i + 1;
    while (end < lines.length) {
      const closing = /^ {0,3}(`+|~+)\s*$/.exec(lines[end])?.[1];
      if (closing?.[0] === marker && closing.length >= length) break;
      end++;
    }
    if (fence[2].toLowerCase() === "mermaid") {
      add("markdown", prose, i);
      add("mermaid", i, Math.min(end + 1, lines.length), lines.slice(i + 1, end).join("\n"));
      prose = end + 1;
    }
    i = end;
  }
  add("markdown", prose, lines.length);
  return blocks;
}
