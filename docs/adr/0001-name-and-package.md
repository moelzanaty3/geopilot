# ADR-0001: Name, package and binaries

Status: Accepted (resolves spec OPEN-Q1 provisionally; trademark check still open)

## Context

The specification uses `geo-check` as a provisional package and binary name and asks the owner to choose. The repository is `trace-rank`, and the owner asked for the work to be done there.

## Decision

- The npm package is `trace-rank`. It ships two binaries: `trace-rank` and `geo-check`, so commands written against the specification keep working.
- Contract names stay as the specification defines them: `geo.config.json`, `.geo/`, rule ids `GEO-xxx`, schemas `geo-report/v1`, `geo-insights/v1`, `geo-merged/v1`, environment variables `GEO_*`, the skill name `geo`.
- The docs and schema domain is GitHub Pages: `https://moelzanaty3.github.io/trace-rank/` (resolves OPEN-Q8).

## Consequences

- "rank" in the product name must never be read as a ranking claim. Every report carries the disclaimer, and the docs say readiness is not a ranking.
- A trademark and availability check is still needed before a public 1.0.
