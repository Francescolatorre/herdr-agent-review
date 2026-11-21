// An opt-in hint that a newer release exists. Off unless the block's props say
// `update_check: true`. Then, at most once a day, the mod asks GitHub for the
// latest release (one GET to api.github.com through `curl`, so GitHub sees your
// IP address) and, when it is newer than the installed one, posts a toast. It
// downloads and installs nothing. Failures are silent; the answer is kept in
// the shared key `reviewer.update` so a failed look isn't repeated every time.
import { appHome, exec, notify, readTextFile, shared, setShared } from "herdr";

export const REPO = "Francescolatorre/herdr-agent-review";
const KEY = "reviewer.update", DAY = 24 * 60 * 60 * 1000;

/** True when version `a` is newer than `b`. Numeric, field by field, so 0.10.0 is
 *  newer than 0.9.0; a suffix such as -rc.1 or +build is ignored. */
export function newer(a, b) {
  const part = (v) => String(v).replace(/^v/, "").split(/[-+]/)[0].split(".").map((n) => Number(n) || 0);
  const x = part(a), y = part(b);
  for (let i = 0; i < 3; i++) {
    if ((x[i] ?? 0) > (y[i] ?? 0)) return true;
    if ((x[i] ?? 0) < (y[i] ?? 0)) return false;
  }
  return false;
}

/** The `tag_name` in a GitHub "latest release" response, or null. */
export function tagOf(body) {
  try { const tag = JSON.parse(body)?.tag_name; return typeof tag === "string" && tag ? tag : null; }
  catch { return null; }
}

/** Resolves "off", "recent", "unknown" (own version unreadable), "failed", "none"
 *  (no release published), "current" or "available". It never rejects: whatever goes
 *  wrong (a firewall or VPN in the way, curl missing, a stray exception) is "failed". */
export async function checkForUpdate(options = {}) {
  try { return await look(options); } catch { return "failed"; }
}

async function look({ enabled, repo = REPO, now = Date.now() } = {}) {
  if (enabled !== true) return "off";
  const state = shared(KEY) && typeof shared(KEY) === "object" ? shared(KEY) : {};
  if (now - (Number(state.checked) || 0) < DAY) return "recent";
  let installed = null;
  try { installed = JSON.parse(await readTextFile(`${appHome()}/mods/reviewer/mod.json`))?.version ?? null; } catch { /* unreadable */ }
  if (!installed) return "unknown";
  setShared(KEY, { ...state, checked: now });
  const url = `https://api.github.com/repos/${repo}/releases/latest`;
  const r = await exec("curl", ["-fsSL", "--connect-timeout", "5", "--max-time", "20", "-H", "Accept: application/vnd.github+json", url], { timeout: 30000 })
    .catch(() => ({ code: 1, stdout: "" }));
  if (r.code !== 0) return "failed";
  const tag = tagOf(r.stdout);
  if (!tag) return "none";
  const latest = tag.replace(/^v/, "");
  if (!newer(latest, installed)) { setShared(KEY, { ...state, checked: now, latest }); return "current"; }
  const first = state.notified !== latest;
  setShared(KEY, { checked: now, latest, notified: latest });
  if (first) {
    notify({
      title: `Reviewer ${latest} is available`,
      body: `You have ${installed}. Download it from https://github.com/${repo}/releases/tag/${tag}`,
      level: "info",
    });
  }
  return "available";
}
