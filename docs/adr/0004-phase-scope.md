# ADR-0004: What was built, against the phase plan

Status: Accepted by owner instruction; Phase 0 items remain open

## Context

The specification freezes Phase 0 and says Phase 1 is not authorised until its gates clear. The owner instructed that the CLI, website and release machinery be implemented now, and that decisions be taken without waiting.

## Decision

Built:

- Phase 1 (M1–M3): secure URL fetching; the Next.js repository reader; every alpha rule; exact/file/candidate/unmapped/absent provenance; S1, S2, G1, G2, G3 with dry run, approval, snapshots, V1–V4 and rollback; `explain`; the Claude Code skill including the fix workflow.
- Parts of Phase 2 that the alpha needs to be honest: static HTML T2/T3, readiness/coverage/confidence (driven by the executable fixtures A–E), insight validation L1/L2 and report merge/convert.

Not built (Phase 2+ or needs real-world evidence):

- Renderer; SARIF and GitHub output; `review`, baselines, hooks, the Action; G4 and G5; non-Claude hosts.
- Phase 0 evidence the owner must still produce: the three hand-labelled Next.js demo apps, the serve-mechanism spike on macOS and Windows (CI runs the tests on all three systems), the precision benchmarks, and capacity/IP confirmation.

## Consequences

- Version numbers stay below 1.0 and the first release is anchored at 0.x.
