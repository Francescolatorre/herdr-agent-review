// Inventory and presentation are separate: a deleted path belongs to the
// comparison even when it is absent from the selected snapshot.
export async function gitInventory(read, commit) {
  const args = commit ? ["ls-tree", "-r", "--name-only", "-z", commit]
    : ["ls-files", "--cached", "--others", "--exclude-standard", "-z"];
  return (await read(args)).split("\0").filter(Boolean);
}

// What Git ignores in the working tree. A wholly ignored folder (node_modules, dist) comes back
// as one entry, not as its files: listing those takes minutes in a real project. Such a folder
// is shown but not opened.
export async function ignoredInventory(read) {
  const entries = (await read(["ls-files", "--others", "--ignored", "--exclude-standard", "--directory", "-z"])).split("\0").filter(Boolean);
  return {
    files: entries.filter((entry) => !entry.endsWith("/")),
    directories: entries.filter((entry) => entry.endsWith("/")).map((entry) => entry.slice(0, -1)),
  };
}

export function buildTree(paths, changes, directories = [], ignored = new Set()) {
  const folders = new Map();
  const root = { path: "", children: [] };
  folders.set("", root);
  function parentOf(path) {
    const slash = path.lastIndexOf("/");
    return slash < 0 ? root : folder(path.slice(0, slash));
  }
  function folder(path) {
    if (!folders.has(path)) {
      const node = { path, children: [], changed: false };
      parentOf(path).children.push(node);
      folders.set(path, node);
    }
    return folders.get(path);
  }
  for (const path of directories) folder(path);
  for (const path of ignored) if (folders.has(path)) folders.get(path).ignored = true;
  const files = new Map(paths.map(path => [path, ignored.has(path) ? { path, ignored: true } : { path }]));
  for (const change of changes) files.set(change.path, change);
  for (const file of files.values()) {
    let parent = parentOf(file.path);
    parent.children.push(file);
    while (file.status && parent !== root && !parent.changed) {
      parent.changed = true;
      parent = parentOf(parent.path);
    }
  }
  for (const node of folders.values()) {
    node.children.sort((a, b) => Number(Boolean(b.children)) - Number(Boolean(a.children)) || a.path.localeCompare(b.path));
  }
  return { root, files };
}

export function visibleRows(tree, expanded) {
  const rows = [];
  function visit(dir) {
    for (const node of dir.children) {
      rows.push(node);
      if (node.children && expanded.has(node.path)) visit(node);
    }
  }
  visit(tree.root);
  return rows;
}

export function fileLines(text) {
  if (typeof text !== "string") return ["Cannot preview this file (too large or unreadable)"];
  if (text.includes("\0")) return ["Binary file"];
  if (text === "") return [];
  const lines = text.replace(/\r?\n$/, "").split(/\r?\n/);
  if (lines.length > 30000 || text.length > 2000000) return ["File too large to preview"];
  return lines.map(line => " " + line);
}
