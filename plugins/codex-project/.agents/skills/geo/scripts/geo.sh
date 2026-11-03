#!/usr/bin/env sh
# Runs the geopilot CLI version this skill was installed with: a matching install
# on PATH first, otherwise the pinned npm version. Never @latest.
#
# The repository being scanned is untrusted, so nothing is run from it. Plain npx
# would reuse a matching package in its node_modules and read its .npmrc; --prefix
# points npx at an empty directory while the command still runs in this one.
set -eu
want=$(sed -n 's/^ *engine-version: *"\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' "$(dirname "$0")/../SKILL.md" | head -n 1)
if command -v geopilot >/dev/null 2>&1 && [ "$(geopilot --version 2>/dev/null)" = "$want" ]; then
  exec geopilot "$@"
fi
exec npx --yes --prefix "$(mktemp -d)" "geopilot@$want" "$@"
