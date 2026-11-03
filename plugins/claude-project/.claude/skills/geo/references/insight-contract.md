# geo-insights/v1

```json
{
  "schemaVersion": "geo-insights/v1",
  "producer": { "host": "claude-code", "model": "<model>", "skillVersion": "<engine-version>" },
  "basedOn": { "runId": "r-…", "reportSha256": "<sha256 of report.json>", "gitCommit": "<HEAD or null>" },
  "insights": [
    {
      "id": "ins-1",
      "kind": "recommendation",
      "category": "metadata",
      "title": "…",
      "description": "…",
      "evidence": [
        { "type": "file", "path": "app/page.tsx", "lines": { "start": 3, "end": 8 }, "quote": "exact text" },
        { "type": "url", "url": "https://…/page", "selector": "meta[name=description]" },
        { "type": "finding", "fingerprint": "geo1:GEO-012:…" }
      ],
      "related": { "fingerprints": [], "routes": [], "files": [], "insights": [] },
      "conflictsWith": [],
      "confidence": "medium",
      "priority": "medium",
      "effort": "small",
      "expectedBenefit": "…",
      "suggestedAction": "…",
      "fixClass": "contextual",
      "approvalRequired": true,
      "verification": "V2",
      "uncertainty": "…"
    }
  ]
}
```

- `kind` is `recommendation` or `hypothesis`. Never `verified`.
- `fixClass` is `contextual`, `editorial` or `unsupported`; safe/guarded fixes
  belong to the engine.
- File evidence is checked at `basedOn.gitCommit`; quotes are compared with
  whitespace normalised. URL evidence must be a URL fetched in the cited run.
- Your file attributions live here, as evidence — never as engine provenance.
- The full JSON Schema is `schemas/insights.schema.json`.
