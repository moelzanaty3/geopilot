# Workflow: review

Compare two runs without editing anything: read both `report.json` files and
report entering/leaving findings by fingerprint. Show a numeric readiness change
only if scoring version, ruleset major.minor and the set of direct
`(ruleId, subject)` pairs are identical; otherwise say "assessment scope
changed". A finding that went from fail to not_evaluated or error is **not
resolved**. (The CLI `review` command is Phase 3.)
