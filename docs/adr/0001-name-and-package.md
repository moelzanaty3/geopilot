# ADR-0001: Name, package and binaries

Status: Accepted (resolves spec OPEN-Q1 provisionally; trademark check still open)

## Context

The specification uses `geo-check` as a provisional package and binary name and asks the owner to choose. The owner named the repository `geopilot`.

## Decision

- The npm package is `geopilot`. It ships one binary, `geopilot`. The `geo-check` alias was removed before anything was published, so no installed command depends on it.
- The project was first built as `trace-rank` and renamed with the repository before anything was published.
- Contract names stay as the specification defines them: `geo.config.json`, `.geo/`, rule ids `GEO-xxx`, schemas `geo-report/v1`, `geo-insights/v1`, `geo-merged/v1`, environment variables `GEO_*`, the skill name `geo`.
- The docs and schema domain is GitHub Pages: `https://moelzanaty3.github.io/geopilot/` (resolves OPEN-Q8).

## Consequences

- Every report carries the disclaimer, and the docs say readiness is not a ranking.
- A trademark and availability check is still needed before a public 1.0.
