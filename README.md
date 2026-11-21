# reviewer

A [Herdr](https://herdr.dev) mod that turns the shipped Changes panel into
a pull-request style review of your working tree. Diffs are syntax colored,
you click lines to leave comments, and "Submit review" sends every comment,
with the lines it is about, to the agent running in the space as one
message.

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
  commits when it has left its base, else the last 100. A branch
  that has left its base opens in *vs main*; the choice is remembered per
  repo.

  ![Scope picker](screenshots/scope-picker.png)

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

## Versions

This checkout is based on upstream Reviewer 0.6.0; 0.7.0 adds the keys and
`reviewer-toggle`, tested with herdr-app 0.1.16 and hc 0.1.21. The mod version is the
`version` field in `mods/reviewer/mod.json`. When reporting a problem, include
that version and the output of `herdr-app --version` and `hc --version`.

## Keys

`scripts/install.sh` adds these from the repo's `keys.json`:

| Key | Does |
|---|---|
| `ctrl-shift-r` | Open Reviewer in the side panel, or close it when it is shown |
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
| `mod.open:reviewer-toggle` | Show or hide Reviewer (an app command) |

Block props: `palette` (`one-dark-pro`, `dark-plus` or `theme`),
`font_size` (overrides the diff's size), `base` (the branch *vs main*
compares against; default `origin/HEAD`, else `main`, else `master`).

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
