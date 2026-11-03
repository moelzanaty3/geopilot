# Workflow: insights

1. Use the latest run: `ls .geo/runs | tail -1`, read its `report.json`, and note
   `run.id`, `run.gitCommit` and the SHA-256 of `report.json`
   (`scripts/geo.sh` does not compute it; use `sha256sum` / `Get-FileHash`).
2. Inspect the files and retained pages relevant to the findings.
3. Write `.geo/insights.json` following `insight-contract.md`. `kind` is only
   `recommendation` or `hypothesis`.
4. Validate: `scripts/geo.sh insights validate .geo/insights.json`.
   Exit 0: evidence resolved. Exit 1: fix the invalid references. Exit 4: the
   run evidence is missing, so references are unchecked — say so.
5. Present results as "evidence resolved", never "verified recommendation".
   Exclude `stale` insights from planning.
