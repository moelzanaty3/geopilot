import { usage } from '../core/errors.ts';

// A small, strict argv parser. Unknown flags are usage errors: a mistyped
// --aprove must never be read as "no approval needed".

export interface FlagSpec {
  readonly name: string;
  readonly type: 'boolean' | 'string' | 'multi';
  readonly short?: string;
}

export const GLOBAL_FLAGS: readonly FlagSpec[] = [
  { name: 'config', type: 'string' },
  { name: 'cwd', type: 'string' },
  { name: 'format', type: 'multi' },
  { name: 'output', type: 'multi', short: 'o' },
  { name: 'non-interactive', type: 'boolean' },
  { name: 'yes', type: 'boolean', short: 'y' },
  { name: 'quiet', type: 'boolean', short: 'q' },
  { name: 'verbose', type: 'boolean' },
  { name: 'no-color', type: 'boolean' },
  { name: 'no-cache', type: 'boolean' },
  { name: 'print-config', type: 'boolean' },
  { name: 'help', type: 'boolean', short: 'h' },
];

export const SCAN_FLAGS: readonly FlagSpec[] = [
  { name: 'url', type: 'multi' },
  { name: 'max-pages', type: 'string' },
  { name: 'max-depth', type: 'string' },
  { name: 'routes', type: 'multi' },
  { name: 'render', type: 'string' },
  { name: 'follow-external', type: 'boolean' },
  { name: 'ignore-robots', type: 'boolean' },
  { name: 'fail-on', type: 'string' },
  { name: 'min-readiness', type: 'string' },
  { name: 'fail-on-incomplete', type: 'boolean' },
  { name: 'baseline', type: 'string' },
  { name: 'rule', type: 'multi' },
  { name: 'skip-rule', type: 'multi' },
];

export const FIX_FLAGS: readonly FlagSpec[] = [
  { name: 'rule', type: 'multi' },
  { name: 'apply', type: 'boolean' },
  { name: 'approve', type: 'multi' },
  { name: 'verify', type: 'string' },
  { name: 'rollback', type: 'string' },
  { name: 'verify-cmd', type: 'multi' },
  { name: 'serve', type: 'boolean' },
  { name: 'allow-dirty', type: 'boolean' },
  { name: 'url', type: 'multi' },
];

export const INIT_FLAGS: readonly FlagSpec[] = [
  { name: 'origin', type: 'string' },
  { name: 'language', type: 'string' },
  { name: 'force', type: 'boolean' },
];

export const AGENT_FLAGS: readonly FlagSpec[] = [
  { name: 'host', type: 'string' },
  { name: 'write-agents-md', type: 'boolean' },
];

export const RULES_FLAGS: readonly FlagSpec[] = [
  { name: 'all', type: 'boolean' },
  { name: 'json', type: 'boolean' },
];

export const INSIGHTS_FLAGS: readonly FlagSpec[] = [{ name: 'run', type: 'string' }];

export interface Parsed {
  readonly positionals: string[];
  readonly bool: ReadonlySet<string>;
  readonly str: ReadonlyMap<string, string>;
  readonly multi: ReadonlyMap<string, string[]>;
}

export function parseArgs(argv: readonly string[], specs: readonly FlagSpec[]): Parsed {
  const byName = new Map(specs.map((s) => [s.name, s]));
  const byShort = new Map(specs.filter((s) => s.short).map((s) => [s.short!, s]));
  const positionals: string[] = [];
  const bool = new Set<string>();
  const str = new Map<string, string>();
  const multi = new Map<string, string[]>();
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    let spec: FlagSpec | undefined;
    let inline: string | undefined;
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      const name = eq === -1 ? arg.slice(2) : arg.slice(2, eq);
      inline = eq === -1 ? undefined : arg.slice(eq + 1);
      spec = byName.get(name);
      if (!spec) throw usage(`unknown flag --${name}`, 'Run geopilot --help for the flags each command takes.');
    } else if (arg.startsWith('-') && arg.length === 2) {
      spec = byShort.get(arg[1]!);
      if (!spec) throw usage(`unknown flag ${arg}`);
    } else {
      positionals.push(arg);
      continue;
    }
    if (spec.type === 'boolean') {
      if (inline !== undefined) throw usage(`--${spec.name} takes no value`);
      bool.add(spec.name);
      continue;
    }
    const value = inline ?? argv[++i];
    if (value === undefined || (inline === undefined && value.startsWith('--'))) throw usage(`--${spec.name} needs a value`);
    if (spec.type === 'string') {
      if (str.has(spec.name)) throw usage(`--${spec.name} was given twice`);
      str.set(spec.name, value);
    } else multi.set(spec.name, [...(multi.get(spec.name) ?? []), value]);
  }
  return { positionals, bool, str, multi };
}

export function intFlag(p: Parsed, name: string, min: number, max: number): number | undefined {
  const v = p.str.get(name);
  if (v === undefined) return undefined;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) throw usage(`--${name} must be an integer from ${min} to ${max}`);
  return n;
}
