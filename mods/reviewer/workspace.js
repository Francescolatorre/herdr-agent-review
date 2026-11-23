import { exec, run, window } from "herdr";

// A remote space may use a different OS from the Herdr window.
export function isWindows(root, on) {
  return on ? /^(?:[A-Za-z]:[\\/]|\\\\)/.test(root) : window()?.platform === "windows";
}

export async function directory(cwd, on) {
  let result;
  if (isWindows(cwd, on)) {
    const script = `
      [Console]::OutputEncoding = [Text.UTF8Encoding]::new($false)
      $ErrorActionPreference = 'Stop'
      foreach ($file in Get-ChildItem -LiteralPath . -Force) {
        if ($file.Name -eq '.git') { continue }
        $kind = if ($file.PSIsContainer) { 'd' } else { 'f' }
        [Console]::Write($kind + $file.Name + [char]0)
      }`;
    result = await exec("powershell.exe", ["-NoProfile", "-Command", script], { cwd, on });
  } else {
    const script = String.raw`
      for path in * .[!.]* ..?*; do
        [ "$path" != .git ] || continue
        if [ -d "$path" ]; then kind=d
        elif [ -f "$path" ]; then kind=f
        else continue; fi
        printf '%s%s\0' "$kind" "$path"
      done`;
    result = await exec("sh", ["-c", script], { cwd, on });
  }
  if (result.code !== 0) throw new Error(result.stderr || "Cannot read directory");
  return result.stdout.split("\0").filter(Boolean).map(entry => ({ name: entry.slice(1), dir: entry[0] === "d" }));
}

export function openEditor(root, path, space, on) {
  const absolute = root.replace(/[\\/]$/, "") + "/" + path;
  let argv;
  if (isWindows(root, on)) {
    // Encode the path as data: PowerShell also treats typographic quotes as
    // delimiters, and Windows filenames may legally contain them.
    const units = absolute.split("").map(char => char.charCodeAt(0));
    const script = `
      $file = -join [char[]]@(${units.join(",")})
      $editor = $env:VISUAL
      if (!$editor) { $editor = $env:EDITOR }
      if (!$editor) { $editor = 'edit.exe' }
      if (Test-Path -LiteralPath $editor -PathType Leaf) {
        & $editor $file
      } else {
        $errors = $null
        $tokens = [Management.Automation.PSParser]::Tokenize($editor, [ref]$errors)
        if ($errors.Count) { throw "Invalid editor command" }
        $program = $tokens[0].Content
        $options = @($tokens | Select-Object -Skip 1 | ForEach-Object { $_.Content })
        & $program @options $file
      }`;
    argv = ["powershell.exe", "-NoProfile", "-Command", script];
  } else {
    // VISUAL/EDITOR are user-configured commands (possibly with options);
    // the repository-supplied path stays a separate positional parameter.
    const script = [
      'editor=${VISUAL:-$EDITOR}',
      'if [ -z "$editor" ]; then',
      '  if command -v nano >/dev/null 2>&1; then editor=nano; else editor=vi; fi',
      'fi',
      'if [ -x "$editor" ]; then exec "$editor" "$1"; fi',
      `exec sh -c "$editor"' "$1"' editor "$1"`,
    ].join("\n");
    argv = ["sh", "-c", script, "reviewer-editor", absolute];
  }
  run("tab.new", { name: "Edit " + path.split("/").pop(), space, folder: root, argv });
}
