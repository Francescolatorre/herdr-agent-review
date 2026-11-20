// Host-independent review data. Imported by both GPUI and the Node tests.
export function parseStatus(text) {
  return text.split("\0").filter(Boolean).map(entry => ({
    status: entry.slice(0, 2), path: entry.slice(3), fresh: entry.startsWith("?? "),
  }));
}

export function parseDiff(text) {
  let old = 0, next = 0, inHunk = false;
  const rows = [];
  for (const line of text.replace(/\n$/, "").split("\n")) {
    const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (match) {
      old = Number(match[1]); next = Number(match[2]); inHunk = true;
      rows.push({ kind: "@", text: line });
    } else if (inHunk && ["+", "-", " "].includes(line[0])) {
      const kind = line[0];
      rows.push({ kind, text: line.slice(1), old: kind === "+" ? null : old++, next: kind === "-" ? null : next++ });
    } else if (inHunk && line.startsWith("\\")) rows.push({ kind: "@", text: line });
  }
  return rows;
}

export function addedDiff(text) {
  if (!text) return "";
  const lines = text.replace(/\n$/, "").split("\n");
  return `@@ -0,0 +1,${lines.length} @@\n${lines.map(line => "+" + line).join("\n")}\n`;
}

export function fingerprint(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return `${text.length}:${hash >>> 0}`;
}

export function anchor(row) {
  if (row.kind === "@") return null;
  return { side: row.kind === "-" ? "old" : "new", line: row.kind === "-" ? row.old : row.next, code: row.text };
}

export function draftKey(machine, root) {
  return "agent-review:v1:" + JSON.stringify([machine ?? null, root]);
}

export function decodeDraft(raw) {
  if (!raw) return [];
  const value = JSON.parse(raw);
  if (value.version !== 1 || !Array.isArray(value.comments) || !value.comments.every(c =>
    typeof c.id === "string" && typeof c.path === "string" && typeof c.body === "string" &&
    typeof c.code === "string" && typeof c.fingerprint === "string" &&
    ["old", "new"].includes(c.side) && Number.isInteger(c.line) && c.line > 0)) {
    throw new Error("Unsupported or damaged review draft. Stored data has not been replaced.");
  }
  return value.comments;
}

export function feedback(root, machine, comments) {
  return [`Review feedback`, `Repository: ${root}`, `Machine: ${machine || "local"}`, "",
    ...comments.flatMap((c, i) => [
      `${i + 1}. ${c.path}:${c.line} (${c.side} version)${c.stale ? " — RECHECK: diff changed or unavailable" : ""}`,
      `Reviewed code: ${JSON.stringify(c.code)}`, c.body, "",
    ]),
  ].join("\n");
}
