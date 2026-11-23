// Opens the review message for confirmation in the space it came from. Should
// the overlay fail to open, the text goes straight to that space's agent.
import { agents, focused, hc, notify, openOverlay, setShared, shared } from "herdr";
import { log } from "./log.js";

const agentName = (agent) => agent.tab_name || agent.program?.name || agent.app || agent.address;

/** The agent in a space a message goes to: the focused one, else an idle one,
 *  else the first (the same rule the send dialog starts from). */
export function pickAgent(space) {
  const list = agents().filter((a) => a.space === space);
  return list.find((a) => a.focused) ?? list.find((a) => a.status === "idle") ?? list[0] ?? null;
}

// Tells the caller the text went out, the way the send dialog does: a time under
// `sent` in shared `reviewer.sent`.
function report(sent) {
  if (!sent) return;
  const previous = shared("reviewer.sent");
  setShared("reviewer.sent", { ...(previous && typeof previous === "object" ? previous : {}), [sent]: Date.now() });
}

/** Resolves "dialog" (opened), "sent" (sent directly) or "none" (nothing was
 *  sent; a toast says why and the drafts stay). */
export async function ask({ title, context, sent, folder }) {
  const origin = focused();
  try {
    openOverlay({
      mod: "reviewer", kind: "dialog", modal: true,
      width: context ? 680 : 560, height: context ? 560 : 250,
      props: { dialog: true, title, context, sent, space: origin?.space, folder: folder ?? origin?.cwd },
    });
    return "dialog";
  } catch (e) {
    log("dialog.open", e);
  }
  const text = String(context ?? "").trim();
  if (!text) return "none";
  const agent = pickAgent(origin?.space);
  if (!agent) {
    notify({ title: "No agent in this space", body: "Start an agent in this space first.", level: "warning" });
    return "none";
  }
  // The dialog asks "Send anyway" before typing into a working or blocked
  // agent; with no dialog there is nobody to ask, so nothing is sent.
  if (agent.status === "working" || agent.status === "blocked") {
    notify({ title: `${agentName(agent)} is ${agent.status}`, body: "Not sent. Try again when it is idle.", level: "warning" });
    return "none";
  }
  const r = await hc(["send", "--", agent.address, text]).catch((e) => ({ code: 1, stdout: "", stderr: String(e) }));
  if (r.code === 0) {
    notify({ title: `Sent to ${agentName(agent)}`, body: title, level: "success" });
    report(sent);
    return "sent";
  }
  log("agent.send", r.stderr, r.code);
  notify({ title: "Send failed", body: (r.stderr || r.stdout).trim().slice(0, 200), level: "error" });
  return "none";
}
