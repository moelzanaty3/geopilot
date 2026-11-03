import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TOOL_VERSION } from '../core/version.ts';

// One canonical skill (skill/geo). Hosts are labelled by what has been tested:
// only Claude Code is supported in this release; the AGENTS.md section is a
// provisional fallback that needs --write-agents-md.

export type Host = 'claude-code' | 'agents-md';
export const HOSTS: readonly { readonly id: string; readonly status: 'supported' | 'provisional' | 'not_available' }[] = [
  { id: 'claude-code', status: 'supported' },
  { id: 'agents-md', status: 'provisional' },
  { id: 'copilot', status: 'not_available' },
  { id: 'cursor', status: 'not_available' },
  { id: 'opencode', status: 'not_available' },
  { id: 'codex', status: 'not_available' },
];

export const VERSION_PLACEHOLDER = '{{ENGINE_VERSION}}';

export function skillSource(): string {
  // dist/agent → ../../skill (published copy); src/agent → ../../../../skill (repository).
  const published = fileURLToPath(new URL('../../skill/geo/', import.meta.url));
  if (existsSync(published)) return published;
  return fileURLToPath(new URL('../../../../skill/geo/', import.meta.url));
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

export function installTarget(repoRoot: string, host: Host): string {
  return host === 'claude-code' ? join(repoRoot, '.claude', 'skills', 'geo') : join(repoRoot, 'AGENTS.md');
}

export function installedVersion(repoRoot: string): string | null {
  const file = join(installTarget(repoRoot, 'claude-code'), 'SKILL.md');
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
  const src = skillSource();
  if (host === 'claude-code') {
    const target = installTarget(repoRoot, host);
    const writes = listSkillFiles(src).map((rel) => {
      const content = readFileSync(join(src, rel), 'utf8').replaceAll(VERSION_PLACEHOLDER, TOOL_VERSION);
      const path = join(target, rel);
      return { path, content, exists: existsSync(path) };
    });
    return { host, writes };
  }
  const path = installTarget(repoRoot, host);
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
