# Herdr Agent Review

A native **herdr-app mod** for reviewing uncommitted changes, attaching line comments and preparing feedback for a coding agent. No old Herdr TUI plugin dependency, build step or npm dependencies.

## Prototype scope

- Git file list and unified diff (index plus working tree against HEAD).
- New files, repositories without a first commit, deleted-line and new-line comments.
- Add, edit and remove single-line review comments.
- Draft storage scoped by machine and repository root, using Herdr localStorage.
- Refresh checks comment snapshots and flags changed/unavailable diffs for rechecking.
- Feedback preview and clipboard export, including original code snippets.

This version never sends to an agent and never stages or commits files. Refresh is manual. A review stays bound to its initial repository when focus changes. Comment edits preserve their original snapshot; to re-anchor a stale comment, remove it and add a new one on the current diff.

## Install

Requires herdr-app with the GPUI mod API (including `on_size_change`, `v_virtual_list`, InputState, localStorage and clipboard context support), and Git on the repository's machine. The installed `~/.config/herdr-app/AGENTS.md` and type declarations are authoritative.

Windows, from this checkout:

```powershell
./scripts/install.ps1
herdr-app check "$HOME/.config/herdr-app/mods/agent-review"
```

On macOS/Linux, copy `mods/agent-review` into `~/.config/herdr-app/mods/agent-review` (or `$HERDR_APP_HOME/mods/agent-review`). Do not overwrite an existing personal mod without a backup.

Open next to an existing pane; use an actual pane ID from `herdr-app ls`:

```sh
herdr-app do pane.split '{"pane":"<pane-id>","direction":"right","mod":"agent-review","props":{"folder":"/absolute/path/to/repo","machine":null}}'
```

For Windows, use a folder such as `C:/Development/project`. For remote review, set `machine` to the machine name known to Herdr and `folder` to its path on that machine. Remote support is implemented via `exec`/`readTextFile` but needs live validation.

Select a file, click a code line, type feedback and choose **Add comment**. **Feedback** refreshes the diff, validates saved comments and opens the export preview. **Copy feedback** only copies; paste it into the agent yourself.

## Development

```sh
npm test
herdr-app check ./mods/agent-review
```

Pure diff parsing, anchoring, draft validation and export live in `review.js`; `main.js` adapts them to Herdr. No shell-generated Git commands: all arguments are passed separately with literal pathspecs. Git external diff and text conversion are disabled.

Before releasing, also exercise the mod in Herdr and inspect `herdr-app status` and a `herdr-app shot` image. The check command does not exercise asynchronous Git reads, deferred diff rows or user interactions.

## Current limitations

Single-line comments; no ranges, branch/commit scope, last-turn tracking, syntax highlighting or direct send. Binary and large previews are excluded (400,000 characters). Rename detection is disabled, so a rename appears as deletion/addition. Conflicts and submodules use Git's available text output; no conflict-resolution UI. Drafts use the installed app's per-copy localStorage semantics; cross-pane/device draft synchronization is not promised. Unsaved text in the comment editor is not persisted. Any changed file diff conservatively marks its saved comments stale, even if a particular line is unchanged.

## Roadmap

1. Validate native layout, comment editing and persistence in daily use.
2. Multi-line comments and navigation to saved comments.
3. Explicit agent selection and confirmed send, with status/error handling.
4. Branch comparison and optional automatic refresh.

MIT — see [LICENSE](LICENSE).
