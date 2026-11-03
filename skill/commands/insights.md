---
name: insights
description: Investigate unmapped GEO findings in this codebase and record validated recommendations
argument-hint: "[GEO-xxx]"
agent: investigator
---

Use the {{AGENT:investigator}} agent to investigate: $ARGUMENTS

Write only `.geo/insights.json` (and `.geo/plan.md` if useful), then validate it with the CLI.
