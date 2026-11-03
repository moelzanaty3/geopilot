# Runs the geopilot CLI version this skill was installed with: a matching
# local install first, otherwise the pinned npm version. Never @latest.
$ErrorActionPreference = 'Stop'
$skill = Join-Path $PSScriptRoot '..\SKILL.md'
$want = (Select-String -Path $skill -Pattern '^\s*engine-version:\s*"?([^"]+)"?\s*$' | Select-Object -First 1).Matches[0].Groups[1].Value
foreach ($bin in @('.\node_modules\.bin\geopilot.cmd', 'geopilot')) {
  $cmd = Get-Command $bin -ErrorAction SilentlyContinue
  if ($cmd -and ((& $cmd.Source --version) -eq $want)) { & $cmd.Source @args; exit $LASTEXITCODE }
}
& npx --yes "geopilot@$want" @args
exit $LASTEXITCODE
