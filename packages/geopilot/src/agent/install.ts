import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOL_VERSION } from '../core/version.ts';

// One canonical agent kit (skill/: the geo skill, agents, commands), rendered
// per host by scripts/build-plugins.mjs. Hosts are labelled by what has been
// checked: Claude Code's plugin and project formats are validated and its
// install is tested; OpenCode's layout follows its documentation but has not
// been run in OpenCode; Copilot CLI installs the shared plugin from the
// marketplace and is provisional; the AGENTS.md section is a fallback.

export type Host = 'claude-code' | 'opencode' | 'agents-md';
export type HostStatus = 'supported' | 'provisional' | 'marketplace' | 'not_available';
export const HOSTS: readonly { readonly id: string; readonly status: HostStatus; readonly note: string }[] = [
  { id: 'claude-code', status: 'supported', note: 'project install: .claude/agents and .claude/skills; or the plugin: /plugin install geopilot --marketplace moelzanaty3/geopilot' },
  { id: 'opencode', status: 'provisional', note: 'project install: .opencode/agents, .opencode/commands, .opencode/skills' },
  { id: 'copilot', status: 'marketplace', note: 'copilot plugin marketplace add moelzanaty3/geopilot && copilot plugin install geopilot@geopilot (provisional)' },
  { id: 'agents-md', status: 'provisional', note: 'a section in AGENTS.md, with --write-agents-md' },
  { id: 'cursor', status: 'not_available', note: 'not tested yet; use agents-md' },
  { id: 'codex', status: 'not_available', note: 'not tested yet; use agents-md' },
];

export const VERSION_PLACEHOLDER = '{{ENGINE_VERSION}}';

/** A generated host bundle: published under hosts/, in the repository under plugins/. */
export function bundleSource(bundle: 'claude-project' | 'opencode' | 'geopilot'): string {
  const published = fileURLToPath(new URL(`../../hosts/${bundle}/`, import.meta.url));
  if (existsSync(published)) return published;
  return fileURLToPath(new URL(`../../../../plugins/${bundle}/`, import.meta.url));
}

export function skillSource(): string {
  return join(bundleSource('claude-project'), '.claude', 'skills', 'geo');
}

export function listSkillFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir).sort()) {
      const abs = join(dir, name);
      if (statSync(abs).isDirectory()) walk(abs);
      else out.push(relative(root, abs).split('\\').join('/'));
    }
  };
  walk(root);
  return out;
}

export function installedVersion(repoRoot: string): string | null {
  const file = join(repoRoot, '.claude', 'skills', 'geo', 'SKILL.md');
  if (!existsSync(file)) return null;
  const m = /engine-version:\s*"?([^"\n]+)"?/.exec(readFileSync(file, 'utf8'));
  return m ? m[1]!.trim() : null;
}

export interface InstallPlan {
  readonly host: Host;
  readonly writes: readonly { readonly path: string; readonly content: string; readonly exists: boolean }[];
}

const AGENTS_START = '<!-- geopilot:begin -->';
const AGENTS_END = '<!-- geopilot:end -->';

export function planInstall(repoRoot: string, host: Host): InstallPlan {
  if (host === 'claude-code' || host === 'opencode') {
    const src = host === 'claude-code' ? bundleSource('claude-project') : bundleSource('opencode');
    const writes = listSkillFiles(src).map((rel) => {
      const content = readFileSync(join(src, rel), 'utf8').replaceAll(VERSION_PLACEHOLDER, TOOL_VERSION);
      const path = join(repoRoot, rel);
      return { path, content, exists: existsSync(path) };
    });
    return { host, writes };
  }
  const path = join(repoRoot, 'AGENTS.md');
  const section = `${AGENTS_START}\n## geopilot (GEO technical readiness)\n\nUse the geopilot CLI for technical readiness checks; never claim rule outcomes it did not report.\n\n- Scan: \`npx geopilot@${TOOL_VERSION} scan --format json\`\n- Explain a rule: \`npx geopilot@${TOOL_VERSION} explain <ruleId>\`\n- Fixes are dry-run by default; apply only after the user approves each guarded fix (\`--approve <fixId>\`).\n- Label your own file attributions as agent-suggested; they are not engine provenance.\n- Report verification honestly: \`applied_unverified\` is not success.\n\nTechnical readiness only. GEO does not measure or predict citations, rankings, traffic or inclusion in any AI or search product.\n${AGENTS_END}\n`;
  const exists = existsSync(path);
  let content = section;
  if (exists) {
    const current = readFileSync(path, 'utf8');
    const s = current.indexOf(AGENTS_START);
    const e = current.indexOf(AGENTS_END);
    content = s !== -1 && e > s ? `${current.slice(0, s)}${section}${current.slice(e + AGENTS_END.length + 1)}` : `${current.replace(/\n*$/, '\n\n')}${section}`;
  }
  return { host, writes: [{ path, content, exists }] };
}

export function executeInstall(plan: InstallPlan): void {
  for (const w of plan.writes) {
    mkdirSync(dirname(w.path), { recursive: true });
    writeFileSync(w.path, w.content, { mode: w.path.endsWith('.sh') ? 0o755 : 0o644 });
  }
}
