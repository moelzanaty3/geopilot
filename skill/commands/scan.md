---
name: scan
description: Audit this codebase for GEO technical readiness, with a code score, evidence, what to fix first and ideas worth considering. No install or running site needed
argument-hint: "[path] [--live <url>]"
agent: scanner
inline: true
---

Audit: $ARGUMENTS

If no target was given, audit the current repository from its code. Only run a live check if I gave a URL or asked for one.

Do the audit yourself, in this session. Don't start a subagent, because its report would have to be written out a second time. Write the report once, as your final message, and add nothing after it.
