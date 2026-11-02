#!/usr/bin/env sh
# Runs the trace-rank CLI version this skill was installed with: a matching
# local install first, otherwise the pinned npm version. Never @latest.
set -eu
want=$(sed -n 's/^ *engine-version: *"\{0,1\}\([^"]*\)"\{0,1\}$/\1/p' "$(dirname "$0")/../SKILL.md" | head -n 1)
for bin in ./node_modules/.bin/trace-rank trace-rank; do
  if command -v "$bin" >/dev/null 2>&1 && [ "$("$bin" --version 2>/dev/null)" = "$want" ]; then
    exec "$bin" "$@"
  fi
done
exec npx --yes "trace-rank@$want" "$@"
