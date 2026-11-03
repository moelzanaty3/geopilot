# Workflow: explain

1. `scripts/geo.sh explain <ruleId>` — use its purpose, sub-checks, evidence class,
   fix variants and references as the source of truth.
2. Add context from the repository if it helps (where the framework sets the
   value), labelled as your reading.
3. Never invent a rule outcome. If the user asks "does my site pass?", run a scan.
4. Retired ids (GEO-001, GEO-005…GEO-008) are not requirements; say so.
