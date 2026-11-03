# Workflow: plan

Write `.geo/plan.md` with one section per change:

- fix class: `safe` / `guarded` (engine fix id from `scripts/geo.sh fix --format json`)
  or `contextual` / `editorial` (yours);
- the evidence: rule id, fingerprint, provenance, files and lines;
- the exact files you propose to touch and what changes;
- the approval each needs (guarded fixes: `--approve <fixId>`; yours: per change);
- the verification it requires (V2 or V4; from the engine for its fixes) and
  whether that verification is available.

Approving the plan does not authorise executing it. Ask again in the fix workflow.
