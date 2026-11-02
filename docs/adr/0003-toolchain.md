# ADR-0003: Toolchain

Status: Accepted

## Context

The specification suggests Vitest. The owner asked for the CLI component, release mechanism and CI to follow the Redline repository.

## Decision

- TypeScript strict (including `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `erasableSyntaxOnly`), ESM, Node's native type stripping for development and `node:test` for tests, `tsc` emit to `dist/` for the published package — the Redline arrangement.
- pnpm workspaces: `packages/trace-rank` (published) and `web/` (docs site). The Phase 3 `packages/action` does not exist yet.
- Node floor 22.18, the parser's own floor and the first 22.x with type stripping on by default.
- Release: semantic-release with npm trusted publishing, a first-release guard and a canary job, as in Redline.

## Consequences

- No test framework dependency. Property tests use a seeded generator in `test/helpers.ts`.
