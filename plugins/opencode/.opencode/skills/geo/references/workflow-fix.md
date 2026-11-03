# Workflow: fix

1. Use the current report. If there isn't one, audit against every rule first, even when the user named one rule, so you can show the code score before and after.
2. Check `git status`. If a target file has uncommitted edits, stop and ask. If on the default branch, create `geo/fix-<YYYYMMDDHHMMSS>`. Do not commit.
3. Propose each change first: the exact file and diff, why it matters in plain words, and the score after it.
4. Approvals, before anything is written:
   - low risk (`lang`, a `Sitemap:` line, one missing canonical): one confirmation for the batch;
   - check first (removing `noindex`, `robots.txt` rules, site-wide canonicals, a sitemap generator): ask for each, and say what could go wrong;
   - your wording (titles, descriptions): write it from what the page says, invent nothing, and ask the user to review it.
5. Apply only what was approved, re-read each file, re-evaluate the rule, and show the score before and after.
6. Say "confirmed in code, not yet confirmed on a live site". For proof, the user starts the site and asks for a live scan.
7. Never touch more than 10 files or anything outside the approved list. Your approvals are behavioural, not enforced by a tool, so say so if asked.
