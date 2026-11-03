import { relative } from 'node:path';
import { EXIT, usage } from '../../core/errors.ts';
import { TOOL_VERSION } from '../../core/version.ts';
import { executeInstall, HOSTS, installedVersion, planInstall, type Host } from '../../agent/install.ts';
import { AGENT_FLAGS, GLOBAL_FLAGS, parseArgs } from '../args.ts';
import { gitRoot, resolveCwd, type Deps } from '../context.ts';

export async function agentCommand(argv: readonly string[], deps: Deps): Promise<number> {
  const p = parseArgs(argv, [...GLOBAL_FLAGS, ...AGENT_FLAGS]);
  const sub = p.positionals[0];
  const cwd = resolveCwd(p, deps);
  const root = gitRoot(cwd) ?? cwd;
  const io = deps.io;
  if (sub === 'status') {
    const v = installedVersion(root);
    io.out(`engine ${TOOL_VERSION}\nclaude-code skill ${v ?? 'not installed'}${v && v !== TOOL_VERSION ? '  (version mismatch: the skill stops until they match; re-run agent install)' : ''}\n`);
    for (const h of HOSTS) io.out(`  ${h.id.padEnd(12)} ${h.status.padEnd(14)} ${h.note}\n`);
    return v && v !== TOOL_VERSION ? EXIT.gate : EXIT.ok;
  }
  if (sub !== 'install') throw usage('agent takes install or status', 'geopilot agent install --host claude-code');
  const host = p.str.get('host');
  if (!host) throw usage('agent install needs --host', `Hosts: ${HOSTS.map((h) => `${h.id} (${h.status})`).join(', ')}`);
  const known = HOSTS.find((h) => h.id === host);
  if (!known) throw usage(`unknown host ${host}`);
  if (known.status === 'not_available') throw usage(`${host} is not available in this release`, known.note);
  if (known.status === 'marketplace') {
    io.out(`${host} installs the geopilot plugin from its marketplace; nothing is written here:\n  ${known.note}\n`);
    return EXIT.ok;
  }
  if (host === 'agents-md' && !p.bool.has('write-agents-md')) throw usage('the AGENTS.md section is written only with --write-agents-md');
  const plan = planInstall(root, host as Host);
  io.out(`agent install --host ${host} (${known.status}) will write:\n`);
  for (const w of plan.writes) io.out(`  ${w.exists ? 'update' : 'create'} ${relative(cwd, w.path) || w.path}\n`);
  io.out('Nothing else is changed: no hooks, CI, lockfiles or other agent configuration.\n');
  const ok = p.bool.has('yes') || (await io.confirm('Proceed?'));
  if (!ok) throw usage('agent install needs approval: answer the prompt or pass --yes');
  executeInstall(plan);
  io.out(`installed (engine ${TOOL_VERSION})\n`);
  return EXIT.ok;
}
