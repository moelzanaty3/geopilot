---
name: scan
description: Audit this codebase for GEO technical readiness, with a code score, evidence and what to fix first. No install or running site needed
argument-hint: "[path] [--live <url>]"
agent: scanner
---

Use the {{AGENT:scanner}} agent to scan: $ARGUMENTS

If no target was given, audit the current repository from its code. Only run a live check if I gave a URL or asked for one. Show me the full report, exactly as the agent wrote it.
