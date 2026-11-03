# Runs the geopilot CLI version this skill was installed with: a matching install
# on PATH first, otherwise the pinned npm version. Never @latest.
#
# The repository being scanned is untrusted, so nothing is run from it. Plain npx
# would reuse a matching package in its node_modules and read its .npmrc; --prefix
# points npx at an empty directory while the command still runs in this one.
$ErrorActionPreference = 'Stop'
$skill = Join-Path $PSScriptRoot '..\SKILL.md'
$want = (Select-String -Path $skill -Pattern '^\s*engine-version:\s*"?([^"]+)"?\s*$' | Select-Object -First 1).Matches[0].Groups[1].Value
$cmd = Get-Command geopilot -ErrorAction SilentlyContinue
if ($cmd -and ((& $cmd.Source --version) -eq $want)) { & $cmd.Source @args; exit $LASTEXITCODE }
$prefix = New-Item -ItemType Directory -Path (Join-Path ([IO.Path]::GetTempPath()) ([IO.Path]::GetRandomFileName()))
& npx --yes --prefix $prefix.FullName "geopilot@$want" @args
exit $LASTEXITCODE
