# reviewer

A [Herdr](https://herdr.dev) mod that turns the shipped Changes panel into
a pull-request style review of your working tree. Diffs are syntax colored,
you click lines to leave comments, and "Submit review" sends every comment,
with the lines it is about, to the agent running in the space as one
message.

This is a fork of Reviewer by Vytas Gavelis (MIT) and keeps his copyright notice
in [LICENSE](LICENSE); see [Versions](#versions) for how its releases are counted.

![reviewer](preview.png)

## What it does

- **Syntax-colored diffs** in One Dark Pro (or `dark-plus`, or your
  terminal theme's ansi colors), with line numbers, hunk headers and
  clearly tinted added and removed rows.
- **The whole file, not just the hunks.** The unchanged lines between the
  changes are folded into "N unchanged lines" rows; click one to show
  those lines, or turn on *Full file* in the header to scroll the whole
  file like an editor's diff view (remembered).
- **Four review scopes**: *Uncommitted* (working tree vs `HEAD`),
  *Last commit* (that commit plus whatever is uncommitted), *vs main*
  (everything since the branch left its base, committed or not), or any
  one commit on its own, picked from the same list: the branch's own
  commits when it has left its base, else the last 100. A worktree opens
  in *Uncommitted* until you choose another scope. That choice is remembered.

  ![Scope picker](screenshots/scope-picker.png)

- **All files** opens the focused worktree as a folder tree. Changed files
  show a status letter, and their parent folders show a colored dot.
  In both Changes and All files, drag the horizontal divider to give the
  file list or the preview more room. With a file open, click **⛶** to
  maximize its preview. **Show files** or **Show tree** restores the split.
  Select a text file to comment on its lines, or use **Comment** for the
  whole file. Drafts from Changes and All files go into the same review.
  In a working-tree comparison, **.gitignored-files** includes ignored
  files on demand. A single-commit review reads that commit's files.
- **Markdown files** (`.md`, `.markdown`) with no change open as a document:
  frontmatter, headings, paragraphs, lists, tables and code blocks each
  appear as a block with its line range, and **Comment** on a block comments
  on those lines. A Mermaid fence shows as source for now. A changed Markdown
  file opens as its diff; **Preview** and **Source** switch between the two.
  A block comment is an ordinary line comment: it shows under its lines in
  the source view too, and goes into the same review. Files that split into
  more than 500 blocks open as text only.
- **Folders outside Git** open directly in All files. Expand folders to
  browse them and review files just as you would in a worktree.
- **Open in editor** opens a working copy in a new Herdr terminal on its
  machine. Set `VISUAL` or `EDITOR` in the launching environment to choose
  your editor. The defaults are `edit.exe` on Windows and `nano` or `vi`
  on Unix. Reviewer refreshes the preview after edits.

- **Comments on lines, ranges, hunks or whole files.** Click a line to
  open the comment box, click another line to widen the range, click a hunk
  header to target the hunk, or the speech bubble on a file to comment on
  the whole file (binaries and images included).

  ![Comment box](screenshots/comment-box.png)

- **Inline draft comments** sit under their lines across any number of
  files, each file shows a badge with its count, and the header reads
  "Submit review · N". Click a comment to edit or delete it. Drafts survive
  reloads and restarts, and each scope keeps its own set.

  ![Inline comments](screenshots/inline-comments.png)

- **Submit review** builds one message, sorted by file and line, each
  comment under a `### path, lines a-b` heading with the quoted lines, and
  hands it to a send dialog where you pick the agent, add a note and send.

  ![Send dialog](screenshots/send-dialog.png)

- **Ask the agent about anything in the diff**, no review needed.
  Right-click a line or a hunk header to ask about just that, or click
  "Ask about diff" to send the whole open file's diff. The same dialog
  opens with the lines attached, you type your question, and it lands in
  the agent's terminal as one message. With no agent in the space it
  starts the most-used installed agent on that space’s machine in a new tab
  with the text. If no agent is installed or discovery fails, the dialog
  keeps your text and shows an error.

  The agent gets the whole review as one message, each comment with the
  lines it is about, and the drafts are cleared.

  ![The review in the agent's terminal](screenshots/review-in-agent.png)

Everything the shipped panel did (file list, diff, commit box) stays.

## Install

This fork targets herdr-App 0.1.16 and herdr-core (`hc`) 0.1.21. The app uses its configured core to send review comments.

A release is a zip, `herdr-reviewer-<version>.zip`, with its `.sha256`, on the
repository's Releases page: unpack it and run `scripts/install.sh` from the
folder (or clone the repository and check out the tag `v<version>`).

1. Run `scripts/install.sh`. It runs `herdr-app check` on a staged copy
   before installing it in `~/.config/herdr-app/mods/` (or
   `$HERDR_APP_HOME/mods/`). Without the script: copy the folder by
   hand and run `herdr-app check ~/.config/herdr-app/mods/reviewer`. Don't
   symlink it; Herdr loads a linked folder but never reloads it.
2. With Herdr open, the script then puts Reviewer where the Changes panel
   is: it swaps the `changes` block in the shown layout for `reviewer`, so
   the Changes button in the tab bar opens Reviewer. Herdr's own layouts
   are read-only, so if you are on one (such as the default `main`) the
   script clones it as `<name>-reviewer` and switches to it; the clone
   keeps your sizes and look. A personal layout is edited in
   place. It also lifts the panel's 900px width cap so you can drag it
   wider; the terminals beside it narrow as it grows (this step needs
   `python3`; without it the cap stays). Pass `--no-layout` to skip this
   step.
3. It also installs `reviewer-toggle`, the small helper `ctrl-shift-r`
   opens, and adds the keys below to your `keys.json`. It only adds keys
   you haven't bound; a key you already use stays yours and the script
   names it, so you can bind that action elsewhere. It needs `python3` and
   an existing `keys.json` (Herdr writes one on first start). Pass
   `--no-keys` to skip this step.
4. Run the script again after each update or checkout; Herdr reloads the
   panel in place. In a layout that already shows `reviewer` it only lifts
   the width cap, if that hasn't been done, and takes out the 480px
   minimum 0.5.1 gave the terminal area, which pushed a wide panel out of
   the window.

Without the script, or with Herdr closed, do step 2 by hand: in your own
layout (`herdr-app do layout.clone '{"name":"main","as":"main-reviewer"}'`
if you are on a shipped one), replace the `changes` block's mod with
`reviewer`, or add a new block for it. For a wider panel, raise `"max"`
on the node that holds it (`panel` in `main`). Herdr never overwrites it, since it
is a clone of the shipped `changes` mod rather than the shipped mod itself.

Reviewer's `mod.json` has `"place": "none"`
because Herdr can't dock a new mod into a shipped layout, and in a
personal one it would dock at the window's edge, not in the Changes
panel's spot.

The mod runs `git` and `hc` (Herdr's terminal core) and reads files under
the repo it shows. It needs nothing else installed: the send dialog is the
mod opened as an overlay of itself.

## Uninstall

Run `scripts/uninstall.sh` from the checkout. It undoes the installer in this
order, and `--dry-run` shows what it would do without changing anything:

1. **Layouts** (needs Herdr open). A `<name>-reviewer` clone the installer made
   is never deleted, since you may have changed it: Herdr is switched back to
   the layout it was cloned from and the clone is set aside as
   `<name>.json.uninstalled` (Herdr can't delete a layout). Running
   `scripts/install.sh` again puts that file back as it was instead of
   cloning anew, so a layout you edited by hand survives. In a layout of your
   own, the `reviewer` block goes back to `changes`. With Herdr closed the layouts are left alone and the script
   tells you to run it again.
2. **Keys.** Every binding to a Reviewer action (`reviewer.*`,
   `mod.open:reviewer-toggle`) is removed, whichever key it is on. Other keys
   stay. It needs `python3`; without it the script names what to remove by hand.
3. **Mods.** `mods/reviewer`, `mods/reviewer-toggle` and a leftover install
   stage.

`--no-layout` and `--no-keys` skip a step. If you skip the keys, `ctrl-shift-r`
stays bound to a mod that is gone. Drafts, the scope and *Full file* live in
Herdr's `shared.json` (`reviewer.*`) and stay, so installing again finds them.
The panel width limit the installer raised is not restored.

`scripts/test-uninstall.sh` runs install and uninstall against a throwaway
home and a stub `herdr-app`; it needs no Herdr and never touches yours.

## Reporting a problem

Reviewer keeps its latest 200 diagnostic events in `reviewer.log` in the
local Herdr app folder (default `~/.config/herdr-app/reviewer.log`, or
`$HERDR_APP_HOME/reviewer.log`). Each line includes a UTC timestamp, the
operation, and, when available, a failure category and numeric exit code.
This covers failures observed by the mod. Output printed inside an editor
or agent terminal is separate.

When opening a bug report, include what you clicked, what you saw and the
Reviewer and Herdr versions. If useful, review and paste just the log lines
around the incident. Sharing is optional and manual.

## Versions

Reviewer started as Vytas Gavelis's mod, with releases 0.1.0 to 0.6.0. This fork
counts its own releases from 0.1.0, so a number here is a release of this fork,
and the original's 0.1.0 to 0.6.0 are different releases. Before the split the
fork used the numbers 0.6.1 to 0.8.1, counted on from the original's; none of
them stayed a release, and the tag `v0.7.0` has been removed.

0.1.0 is everything up to the former 0.8.1: the keys and `reviewer-toggle`,
`scripts/uninstall.sh`, and the direct send when the send dialog can't open.
Tested with herdr-app 0.1.16 and hc 0.1.21.
The install and uninstall scripts' file logic is covered by
`scripts/test-uninstall.sh`, which passed on Windows (Git Bash) and on GitHub's
Ubuntu, macOS and Windows runners. Trying the scripts against a real Herdr has
only been done on Windows; macOS and Linux still need that. The direct send is
covered by `tests/ask.test.mjs` with a stub; the failure itself can't be provoked
in the app, so it has not been tried there. The mod version is the
`version` field in `mods/reviewer/mod.json`. When reporting a problem, include
that version and the output of `herdr-app --version` and `hc --version`.

## Keys

Click **Shortcuts** in the Reviewer header, or press **F1** while Reviewer has
focus. The panel shows your configured Herdr bindings and the keys for writing
comments and sending reviews. Press **Esc** or **F1** to return to your review.

`scripts/install.sh` adds these from the repo's `keys.json`:

| Key | Does |
|---|---|
| `ctrl-shift-r` | Open Reviewer in the side panel, or close it when it is shown |
| `ctrl-shift-f1` | Show or hide keyboard shortcuts while Reviewer is visible |
| `ctrl-shift-enter` | Submit the shown scope's draft comments |
| `ctrl-shift-a` | Ask the agent about the whole open diff |
| `ctrl-shift-s` | Cycle Uncommitted, Last commit and vs main |

`ctrl-shift-r` runs `mod.open:reviewer-toggle`. A key runs one command, and
Reviewer's own commands only reach it while its block is shown, so the
helper does what the tab bar's Changes button does: select Reviewer's block
in its stack and show the panel, or hide the panel when Reviewer is
already shown. It opens as an invisible overlay and closes itself at once.
The other keys only act while Reviewer is shown.

## Commands and props

Bind these in `keys.json` to change the keys above or add more:

| Command | Does |
|---|---|
| `reviewer.submit` | Submit the shown scope's draft comments |
| `reviewer.ask` | Ask the agent about the whole open diff |
| `reviewer.clear` | Discard the shown scope's drafts |
| `reviewer.scope` | Cycle Uncommitted, Last commit and vs main |
| `reviewer.full` | Show or fold the unchanged lines (*Full file*) |
| `reviewer.shortcuts` | Show or hide the keyboard shortcut reference |
| `mod.open:reviewer-toggle` | Show or hide Reviewer (an app command) |

Block props: `palette` (`one-dark-pro`, `dark-plus` or `theme`),
`font_size` (overrides the diff's size), `base` (the branch *vs main*
compares against; default `origin/HEAD`, else `main`, else `master`),
`update_check` (`true` to turn on the update hint, see Updates; default off).

## Updates

`scripts/check-update.sh` asks GitHub for the latest release and compares it with
the version installed in Herdr (`mods/reviewer/mod.json` in the Herdr home). It
only reads: nothing is downloaded or changed. When a newer release exists it says
so, with the page to get it from, and exits 10; to update, download the zip,
check its `.sha256`, unpack it and run `scripts/install.sh`.

The mod can tell you too, but only if you ask: set `"update_check": true` in the
props of Reviewer's block in your layout. Then, at most once a day, it looks and
shows one toast per new release. Either way the only thing sent is one request to
`api.github.com`, so GitHub sees your IP address; nothing is installed for you.

If GitHub can't be reached (offline, a firewall, VPN or proxy in the way, a
certificate or rate-limit error, a login page), nothing breaks: the script says so
and exits 3 within about 20 seconds, and the mod stays silent and tries again the
next day.

## Open a file from another mod

Write a one-shot request with Herdr's `setShared`:

```js
setShared("reviewer.open", {
  id: `${Date.now()}-${Math.random()}`,
  at: Date.now(),
  path: "/absolute/path/to/repo/src/file.js",
  on: null, // Remote machine ID for remote files; null for local files.
  ref: "abc1234", // Optional: review this commit on its own first.
});
```

`path` may also be the repository folder itself, to open Reviewer on the
repo without selecting a file (useful with `ref`). `ref` is anything
`git rev-parse` resolves to a commit (a hash, a tag, `HEAD~2`); it switches
the scope to that commit, as picking it from the scope list would. A `ref`
that isn't in the repo leaves the scope as it was and shows a message.

Then reveal Reviewer's block using `layout.select` and `layout.show`.
Reviewer selects the file and loads its diff after refreshing, including when
a refresh or commit is already running. The request is consumed once; opening
the same file again keeps its diff open. A newer request survives an older
refresh. A request for another repository or machine waits until the
reviewer shows that repository, for up to 30 seconds; after that it is
dropped, as is one without `at`.

The focused pane must already be in the target repository and machine.
Without `ref`, the current review scope stays selected; draft comments are
preserved either way.
If the requested file has no diff in that scope, or falls outside the first
1,000 files, Reviewer shows a message instead of an unrelated diff.

## Recipe

`RECIPE.md` is the brief this mod was built from: an agent with an empty
folder can rebuild it from there.

## License

MIT, see [LICENSE](LICENSE). The mod started as a clone of Herdr's shipped
`changes` mod (Apache-2.0) and uses Lucide icons (ISC); see
[THIRD-PARTY-NOTICES](THIRD-PARTY-NOTICES).
