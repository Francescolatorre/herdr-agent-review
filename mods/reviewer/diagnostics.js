// Only fixed event names, classified failures and numeric exit codes leave
// the call site. Error messages can contain a complete command or review.
const events = new Set(["ready", "refresh", "preview", "watch", "history", "commit",
  "editor.open", "dialog.open", "review.submit", "review.ask", "agent.send",
  "agent.start", "agent.timeout", "delivery.unconfirmed", "render"]);

function reason(error) {
  const message = String(error?.message ?? error ?? "");
  if (/denied|permission|EACCES|EPERM|Zugriff verweigert/i.test(message)) return "permission-denied";
  if (/not found|not recognized|cannot find|no such|ENOENT|nicht gefunden/i.test(message)) return "not-found";
  if (/timed? ?out|timeout/i.test(message)) return "timeout";
  if (/too large|size limit/i.test(message)) return "size-limit";
  if (/not a function|undefined|null reference/i.test(message)) return "invalid-state";
  if (/disconnect|unreachable|connection refused/i.test(message)) return "connection";
  return "failed";
}

export function createLogger(host) {
  let pending = Promise.resolve();
  return function record(event, error, exitCode) {
    if (!events.has(event) || host.checking()) return;
    const platform = host.window()?.platform;
    const entry = { time: new Date().toISOString(), event };
    if (["windows", "linux", "macos"].includes(platform)) entry.os = platform;
    if (error != null) entry.reason = reason(error);
    if (Number.isSafeInteger(exitCode)) entry.exit = exitCode;
    pending = pending.then(async () => {
      const path = host.appHome() + "/reviewer.log";
      // A panel and its dialog can race in separate JS runtimes. Herdr
      // compares the previous contents atomically; retry on a stale read.
      for (let attempt = 0; attempt < 4; attempt++) {
        const before = await host.readTextFile(path);
        const lines = before ? before.trimEnd().split("\n").slice(-199) : [];
        lines.push(JSON.stringify(entry));
        try { await host.writeTextFile(path, lines.join("\n") + "\n", before); return; }
        catch (e) { if (attempt === 3) throw e; }
      }
    }).catch(() => {}); // Diagnostics must not break the operation being reported.
    return pending;
  };
}
