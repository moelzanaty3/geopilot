# Runs the trace-rank CLI version this skill was installed with: a matching
# local install first, otherwise the pinned npm version. Never @latest.
$ErrorActionPreference = 'Stop'
$skill = Join-Path $PSScriptRoot '..\SKILL.md'
$want = (Select-String -Path $skill -Pattern '^\s*engine-version:\s*"?([^"]+)"?\s*$' | Select-Object -First 1).Matches[0].Groups[1].Value
foreach ($bin in @('.\node_modules\.bin\trace-rank.cmd', 'trace-rank')) {
  $cmd = Get-Command $bin -ErrorAction SilentlyContinue
  if ($cmd -and ((& $cmd.Source --version) -eq $want)) { & $cmd.Source @args; exit $LASTEXITCODE }
}
& npx --yes "trace-rank@$want" @args
exit $LASTEXITCODE
