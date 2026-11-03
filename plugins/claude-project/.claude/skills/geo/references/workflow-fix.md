# Workflow: fix

1. Confirm the user wants changes now. Create `geo/fix-<YYYYMMDDHHMMSS>` from the
   current branch (`git switch -c …`). Do not commit.
2. Dry run: `scripts/geo.sh fix --format json`. Show each proposal's diff,
   preconditions and required verification. Blocked variants explain why.
3. Approvals:
   - safe fixes: one confirmation for the batch, then `fix --apply`;
   - guarded fixes: ask for each by id, then `fix --apply --approve <fixId>`.
     `--yes` never approves a guarded fix.
4. Verification: V4 fixes need a server GEO starts after the write. Only if the
   user approves the configured `fix.serve.command` for this run, add `--serve`.
   Otherwise the outcome will be `applied_unverified` (exit 6) — say that plainly.
5. Your own contextual/editorial edits: list exact files and intended changes,
   get approval per change, edit, then re-run `scripts/geo.sh scan … --format json`.
   Report the outcome with the same vocabulary: required level, achieved level,
   `verified` / `applied_unverified` / rolled back. Say your approval was
   behavioural, not CLI-enforced.
6. Report rollback: `scripts/geo.sh fix --rollback <runId>`.
7. Never touch more than 10 files or anything outside the approved list.
