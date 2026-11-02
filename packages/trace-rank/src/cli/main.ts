#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { EXIT, isGeoError } from '../core/errors.ts';
import { DISCLAIMER, TOOL_VERSION } from '../core/version.ts';
import { processIo, type Io } from './io.ts';
import type { Deps } from './context.ts';
import { scanCommand } from './commands/scan.ts';
import { explainCommand, rulesCommand } from './commands/rules.ts';
import { fixCommand } from './commands/fix.ts';
import { initCommand } from './commands/init.ts';
import { agentCommand } from './commands/agent.ts';
import { insightsCommand, reportCommand } from './commands/insights.ts';

export const COMMANDS: readonly { readonly name: string; readonly summary: string; readonly usage: string; readonly phase?: string }[] = [
  { name: 'scan', summary: 'Audit a URL, a repository, or both', usage: 'scan [path|url] [--url <u>...] [--max-pages n] [--max-depth n] [--render auto|always|never] [--rule id] [--skip-rule id] [--fail-on sev] [--min-readiness n] [--fail-on-incomplete] [--ignore-robots] [--follow-external]' },
  { name: 'explain', summary: 'Explain one rule: evidence, sub-checks, fixes, references', usage: 'explain <ruleId>' },
  { name: 'rules', summary: 'List the rule catalogue', usage: 'rules [--all] [--json]' },
  { name: 'fix', summary: 'Dry-run, apply, verify or roll back closed-list fixes', usage: 'fix [path] [--rule id] [--apply [--approve <fixId>...]] [--verify <runId>] [--rollback <runId>] [--verify-cmd "<cmd>"] [--serve] [--allow-dirty] [--url <u>]' },
  { name: 'init', summary: 'Preview and write geo.config.json', usage: 'init [--origin <url>] [--language <tag>] [--yes] [--force]' },
  { name: 'agent', summary: 'Install or check the portable agent skill', usage: 'agent install --host claude-code [--yes] | agent install --host agents-md --write-agents-md | agent status' },
  { name: 'insights', summary: 'Validate an agent insights file (L1 schema, L2 references)', usage: 'insights validate <file> [--run <id>]' },
  { name: 'report', summary: 'Merge insights into a report, or convert a saved report', usage: 'report merge <report.json> [insights.json] [--output f] | report convert <report.json> --format markdown' },
  { name: 'review', summary: 'Diff-aware assessment', usage: 'review [--base <ref>|--staged|--pre-push]', phase: 'Phase 3' },
  { name: 'baseline', summary: 'Fingerprint baselines', usage: 'baseline create|update|show', phase: 'Phase 3' },
  { name: 'hook', summary: 'Opt-in pre-push hook', usage: 'hook install|uninstall|status', phase: 'Phase 3' },
];

export function helpText(): string {
  const lines = [
    `trace-rank ${TOOL_VERSION} — local-first technical readiness auditor (binary alias: geo-check)`,
    '',
    'Usage: trace-rank <command> [options]',
    '',
    'Commands:',
    ...COMMANDS.map((c) => `  ${c.name.padEnd(10)} ${c.summary}${c.phase ? ` (${c.phase}; not in this release)` : ''}`),
    '',
    'Global options:',
    '  --config <file>  --cwd <dir>  --format pretty|json|markdown  --output <file>',
    '  --non-interactive  --yes  --quiet  --verbose  --no-color  --no-cache  --print-config',
    '',
    'Exit codes: 0 ok · 1 gate failed / invalid insights · 2 usage or missing approval · 3 invalid config',
    '            4 incomplete (with --fail-on-incomplete) · 5 fix rolled back · 6 applied but unverified · 70 internal error',
    '',
    `Docs: https://moelzanaty3.github.io/trace-rank/docs/`,
    '',
    DISCLAIMER,
    '',
  ];
  return lines.join('\n');
}

export function commandHelp(name: string): string | null {
  const c = COMMANDS.find((x) => x.name === name);
  return c ? `trace-rank ${c.usage}\n\n${c.summary}.${c.phase ? ` ${c.phase}: not available in this release.` : ''}\n` : null;
}

export interface RunDeps {
  readonly io?: Io;
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly fetcher?: Deps['fetcher'];
  readonly now?: () => Date;
}

export async function run(argv: readonly string[], d: RunDeps = {}): Promise<number> {
  const env = d.env ?? process.env;
  const io = d.io ?? processIo({ nonInteractive: argv.includes('--non-interactive'), noColor: argv.includes('--no-color') }, env);
  const deps: Deps = { io, cwd: d.cwd ?? process.cwd(), env, ...(d.fetcher ? { fetcher: d.fetcher } : {}), ...(d.now ? { now: d.now } : {}) };
  const [command, ...rest] = argv;
  try {
    if (command === undefined || command === '--help' || command === '-h' || command === 'help') {
      const topic = command === 'help' ? rest[0] : undefined;
      io.out(topic ? commandHelp(topic) ?? helpText() : helpText());
      return EXIT.ok;
    }
    if (command === '--version' || command === '-v' || command === 'version') {
      io.out(`${TOOL_VERSION}\n`);
      return EXIT.ok;
    }
    if (rest.includes('--help') || rest.includes('-h')) {
      const h = commandHelp(command);
      if (h) {
        io.out(h);
        return EXIT.ok;
      }
    }
    switch (command) {
      case 'scan':
        return await scanCommand(rest, deps);
      case 'explain':
        return await explainCommand(rest, deps);
      case 'rules':
        return await rulesCommand(rest, deps);
      case 'fix':
        return await fixCommand(rest, deps);
      case 'init':
        return await initCommand(rest, deps);
      case 'agent':
        return await agentCommand(rest, deps);
      case 'insights':
        return await insightsCommand(rest, deps);
      case 'report':
        return await reportCommand(rest, deps);
      case 'review':
      case 'baseline':
      case 'hook':
        io.err(`${command} is a Phase 3 command and is not available in this release.\n`);
        return EXIT.usage;
      default:
        io.err(`unknown command ${command}\n${helpText()}`);
        return EXIT.usage;
    }
  } catch (e) {
    if (isGeoError(e)) {
      io.err(`${io.errColor.red('error')}  ${e.message}\n`);
      if (e.hint) io.err(`       ${io.errColor.dim(e.hint)}\n`);
      return e.exitCode;
    }
    io.err(`${io.errColor.red('internal error')}  ${(e as Error).stack ?? String(e)}\nPlease report it: https://github.com/moelzanaty3/trace-rank/issues\n`);
    return EXIT.internal;
  }
}

function isMain(): boolean {
  try {
    return process.argv[1] !== undefined && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
}

if (isMain()) {
  run(process.argv.slice(2)).then(
    (code) => {
      process.exitCode = code;
    },
    (e: unknown) => {
      process.stderr.write(`internal error ${String(e)}\n`);
      process.exitCode = EXIT.internal;
    },
  );
}
