---
name: scan
description: Run a geopilot GEO technical-readiness scan (URL, repository or both) and report findings
argument-hint: "[path|url] [--url <local-server>]"
agent: scanner
---

Use the {{AGENT:scanner}} agent to scan: $ARGUMENTS

If no target was given, scan the current repository, and if a local dev server is obviously running, ask whether to add `--url`.
