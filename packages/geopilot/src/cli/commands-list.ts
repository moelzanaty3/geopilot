// The command table, shared by --help and the documentation site.
export const COMMANDS: readonly { readonly name: string; readonly summary: string; readonly usage: string; readonly phase?: string }[] = [
  { name: 'scan', summary: 'Audit a URL, a repository, or both', usage: 'scan [path|url] [--url <u>...] [--max-pages n] [--max-depth n] [--render auto|always|never] [--rule id] [--skip-rule id] [--fail-on sev] [--min-readiness n] [--fail-on-incomplete] [--ignore-robots] [--follow-external]' },
  { name: 'explain', summary: 'Explain one rule: evidence, sub-checks, fixes, references', usage: 'explain <ruleId>' },
  { name: 'rules', summary: 'List the rule catalogue', usage: 'rules [--all] [--json]' },
  { name: 'fix', summary: 'Dry-run, apply, verify or roll back closed-list fixes', usage: 'fix [path] [--rule id] [--apply [--approve <fixId>...]] [--verify <runId>] [--rollback <runId>] [--verify-cmd "<cmd>"] [--serve] [--allow-dirty] [--url <u>]' },
  { name: 'init', summary: 'Preview and write geo.config.json', usage: 'init [--origin <url>] [--language <tag>] [--yes] [--force]' },
  { name: 'agent', summary: 'Install or check the portable agent skill', usage: 'agent install --host claude-code [--yes] | agent install --host agents-md --write-agents-md | agent status' },
  { name: 'insights', summary: 'Validate an agent insights file (L1 schema, L2 references)', usage: 'insights validate <file> [--run <id>]' },
  { name: 'report', summary: 'Merge insights into a report, or convert a saved report', usage: 'report merge <report.json> [insights.json] [--output f] | report convert <report.json> --format markdown' },
  { name: 'logs', summary: 'Prove which crawlers reached your site, from access logs', usage: 'logs <file...> [--format json]' },
  { name: 'cloudflare', summary: 'Crawler requests and blocks from Cloudflare analytics', usage: 'cloudflare --zone <id> [--hours n] [--format json]' },
  { name: 'inspect', summary: "Google's index status for a URL", usage: 'inspect <url> --site <property> [--format json]' },
  { name: 'citations', summary: 'Sample whether an AI answer engine cites your domain', usage: 'citations <question> --domain <domain> [--runs n] [--model m] [--yes] [--format json]' },
  { name: 'review', summary: 'Diff-aware assessment', usage: 'review [--base <ref>|--staged|--pre-push]', phase: 'Phase 3' },
  { name: 'baseline', summary: 'Fingerprint baselines', usage: 'baseline create|update|show', phase: 'Phase 3' },
  { name: 'hook', summary: 'Opt-in pre-push hook', usage: 'hook install|uninstall|status', phase: 'Phase 3' },
];

