---
name: fix
description: Preview geopilot's closed-list fixes, then apply only what you approve, with honest verification
argument-hint: "[--rule GEO-xxx]"
agent: fixer
userOnly: true
---

Use the {{AGENT:fixer}} agent to fix GEO findings: $ARGUMENTS

Always start with the dry run and wait for my approval of each guarded fix by id.
