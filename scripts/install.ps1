param([string]$AppHome = $(if ($env:HERDR_APP_HOME) { $env:HERDR_APP_HOME } else { Join-Path $HOME '.config/herdr-app' }))
$ErrorActionPreference = 'Stop'
$source = Join-Path $PSScriptRoot '../mods/agent-review'
$target = Join-Path $AppHome 'mods/agent-review'
if (Test-Path -LiteralPath $target) { throw "Already exists: $target. Back up or remove your previous copy explicitly before reinstalling." }
New-Item -ItemType Directory -Path $target | Out-Null
Copy-Item -Path (Join-Path $source '*') -Destination $target
Write-Output "Installed $target"
Write-Output 'Next: herdr-app check <installed folder>. Open a pane with pane.split and explicit folder props (README.md).'
