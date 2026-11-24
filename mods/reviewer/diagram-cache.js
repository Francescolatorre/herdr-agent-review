// GPUI loads an image from a file under Herdr's app folder, so a rendered diagram is
// written to data/reviewer-mermaid/<key>.svg. Herdr offers no way to delete a file, so the
// cache is bounded instead: an index remembers the newest LIMIT keys, and a file that falls
// out of it is overwritten with an empty SVG (a few bytes). Cost: at most LIMIT real files of
// at most MAX_SVG bytes, plus the empty leftovers.
const DIR = "data/reviewer-mermaid";
const EMPTY = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';
export const LIMIT = 60;

export function createDiagramCache({ appHome, readTextFile, writeTextFile }) {
  const write = async (path, text) => {
    for (let attempt = 0; attempt < 4; attempt++) {
      const before = await readTextFile(path);
      if (before === text) return;
      try { await writeTextFile(path, text, before); return; }
      catch (error) { if (attempt === 3) throw error; } // a second panel may have written meanwhile
    }
  };
  let queue = Promise.resolve();
  /** The asset path (relative to the app folder) holding `svg`; resolves once the file exists. */
  return function store(key, svg) {
    const run = queue.then(async () => {
      const index = `${appHome()}/${DIR}/index.json`;
      let keys = [];
      try { keys = JSON.parse(await readTextFile(index) ?? "[]").filter((k) => typeof k === "string"); } catch { keys = []; }
      await write(`${appHome()}/${DIR}/${key}.svg`, svg);
      keys = [...keys.filter((k) => k !== key), key];
      const dropped = keys.slice(0, Math.max(0, keys.length - LIMIT));
      for (const old of dropped) await write(`${appHome()}/${DIR}/${old}.svg`, EMPTY);
      await write(index, JSON.stringify(keys.slice(dropped.length)));
      return `${DIR}/${key}.svg`;
    });
    queue = run.catch(() => {});
    return run;
  };
}
