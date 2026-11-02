# Workflow: scan

1. Choose the target with the user: a URL (`scan https://…`), the repository
   (`scan .`), or both (`scan . --url http://127.0.0.1:3000`). Private or local
   URLs are fetched only because the user named them.
2. Run: `scripts/geo.sh scan <target> --format json --output .geo/last-scan.json --quiet`
   then read `.geo/last-scan.json`.
3. Report:
   - **Engine findings**: group by severity; for each give rule id, subject,
     message, provenance level and location. Mention inferred findings separately
     as unscored.
   - The readiness *display* exactly as reported (`readiness`, `provisional`, or
     `insufficient evidence`), plus coverage, confidence and assessment scope.
   - Any `assessmentScope.notes` (for example "6 rules need runtime evidence").
   - Then your **Agent recommendations** and **Hypotheses**, labelled.
4. If coverage < 50%, say the result is not a readiness verdict and suggest the
   missing evidence (usually `--url` against a running local server).
5. Do not write anything except what the CLI writes.
