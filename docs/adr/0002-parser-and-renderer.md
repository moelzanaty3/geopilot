# ADR-0002: Parser and renderer

Status: Accepted (resolves spec OPEN-Q5 for this release)

## Decision

- TypeScript/JSX source is parsed with `@babel/parser`, pinned with its only dependency (`@babel/types`, held by a workspace override). It is pure JavaScript, needs no native binaries, and gives exact offsets, which is what byte-minimal splices need.
- HTML, robots.txt and sitemap parsing are written in-tree: each needs a small, well-tested subset, and every dependency is one users inherit.
- No browser renderer ships. GEO-003 and GEO-002 report `not_evaluated` with `renderer_unavailable`, never a failure, as the specification requires.

## Consequences

- One runtime dependency in total.
- A Playwright-based renderer is the obvious next step and must arrive behind the same network guard.
