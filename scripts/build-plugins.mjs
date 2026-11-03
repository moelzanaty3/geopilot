#!/usr/bin/env node
// Renders the canonical agent kit in skill/ (the geo skill, agents/, commands/)
// into each host's own format. skill/ is the only place a human edits; the
// directories under plugins/ are generated and checked in CI with --check.
//
//   node scripts/build-plugins.mjs                 write plugins/ at the package version
//   node scripts/build-plugins.mjs --version 1.2.3 stamp a release version
//   node scripts/build-plugins.mjs --check         fail if plugins/ is stale
//   node scripts/build-plugins.mjs --out <dir>     write elsewhere (the npm package build)

import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RETIRED, RULES } from '../packages/geopilot/src/rules/catalogue.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKILL = join(ROOT, 'skill');
const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i === -1 ? null : (args[i + 1] ?? null);
};
const pkg = JSON.parse(readFileSync(join(ROOT, 'packages', 'geopilot', 'package.json'), 'utf8'));
const VERSION = flag('--version') ?? pkg.version;
const CHECK = args.includes('--check');
const OUT = flag('--out') ?? join(ROOT, 'plugins');
const MARKETPLACE = join(ROOT, '.claude-plugin', 'marketplace.json');
const CODEX_MARKETPLACE = join(ROOT, '.agents', 'plugins', 'marketplace.json');

function parse(file) {
  const text = readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!m) throw new Error(`${file}: missing front matter`);
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = /^([A-Za-z-]+):\s*(.*)$/.exec(line);
    if (!kv) continue;
    let v = kv[2].trim();
    if (/^".*"$/.test(v)) v = v.slice(1, -1);
    meta[kv[1]] = v === 'true' ? true : v === 'false' ? false : v;
  }
  return { meta, body: m[2] };
}

const SHARED = readFileSync(join(SKILL, 'agents', '_shared.md'), 'utf8').replace(/\r\n/g, '\n').trim();
const AGENTS = readdirSync(join(SKILL, 'agents')).filter((f) => f.endsWith('.md') && !f.startsWith('_')).sort().map((f) => parse(join(SKILL, 'agents', f)));
const COMMANDS = readdirSync(join(SKILL, 'commands')).filter((f) => f.endsWith('.md')).sort().map((f) => parse(join(SKILL, 'commands', f)));

for (const a of AGENTS) {
  if (!/^[a-z][a-z0-9-]*$/.test(a.meta.name ?? '') || !a.meta.description) throw new Error(`agent ${a.meta.name}: needs a kebab-case name and a description`);
}
for (const c of COMMANDS) {
  if (!c.meta.name || !c.meta.description) throw new Error(`command ${c.meta.name}: needs name and description`);
  if (c.meta.agent && !AGENTS.some((a) => a.meta.name === c.meta.agent)) throw new Error(`command ${c.meta.name}: unknown agent ${c.meta.agent}`);
}

// Facts come from the engine's catalogue and the how-to from skill/rules.md, so the
// agents and the CLI can't disagree about what a rule is.
function ruleGuide() {
  const text = readFileSync(join(SKILL, 'rules.md'), 'utf8').replace(/\r\n/g, '\n');
  const guides = new Map([...text.matchAll(/^## (GEO-\d+)\n([\s\S]*?)(?=^## GEO-|(?![\s\S]))/gm)].map((m) => [m[1], m[2].trim()]));
  const known = new Set(RULES.map((r) => r.id));
  for (const id of guides.keys()) if (!known.has(id)) throw new Error(`skill/rules.md: ${id} is not in the catalogue`);
  const sections = RULES.map((r) => {
    const guide = guides.get(r.id);
    if (!guide) throw new Error(`skill/rules.md: no guide for ${r.id}`);
    return [
      `### ${r.id}: ${r.title}`,
      r.scored ? `Weight ${r.weight}, ${r.severity} severity.${r.blockerCap ? ` Blocker: ${r.blockerCap}.` : ''}` : 'For information only. Never scored.',
      guide,
      ...(r.subChecks.length > 0 ? [`**Checks:** ${r.subChecks.map((c) => `${c.description} (${c.scope === 'url' ? 'live only' : 'code or live'})`).join('; ')}.`] : []),
      `**How to fix:** ${r.remediation}`,
      ...(r.falsePositives.length > 0 ? [`**Not a problem when:** ${r.falsePositives.join(' ')}`] : []),
      `**Official sources:** ${r.references.map((s) => `[${s.title}](${s.url})`).join(', ')}`,
    ].join('\n\n');
  });
  const retired = RETIRED.map((r) => `${r.id} (${r.title})`).join(', ');
  return `# The rules\n\n${sections.join('\n\n')}\n\n## Not requirements\n\nThese old ideas were retired and aren't rules: ${retired}. Don't recommend them.`;
}

const RULE_GUIDE = ruleGuide();
const reference = (name) => readFileSync(join(SKILL, 'geo', 'references', name), 'utf8').replace(/\r\n/g, '\n').trim();

const yamlString = (s) => JSON.stringify(String(s));

function render(text, agentRef) {
  return text
    .replaceAll('{{SHARED}}', SHARED)
    .replaceAll('{{RULES}}', RULE_GUIDE)
    .replaceAll('{{SCORING}}', reference('scoring.md'))
    .replaceAll('{{REPORT}}', reference('report.md'))
    .replaceAll('{{FRAMEWORKS}}', reference('frameworks.md'))
    .replaceAll('{{ENGINE_VERSION}}', VERSION)
    // --prefix keeps npx from running or configuring itself from the repository being scanned.
    .replaceAll('{{CLI}}', `npx --yes --prefix "$(mktemp -d)" geopilot@${VERSION}`)
    .replace(/\{\{AGENT:([a-z-]+)\}\}/g, (_, name) => agentRef(name));
}

function frontmatter(fields) {
  const lines = Object.entries(fields)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => (typeof v === 'object' ? `${k}:\n${Object.entries(v).map(([kk, vv]) => `  ${kk}: ${vv}`).join('\n')}` : `${k}: ${typeof v === 'boolean' ? v : yamlString(v)}`));
  return `---\n${lines.join('\n')}\n---\n\n`;
}

function copyGeoSkill(dest) {
  cpSync(join(SKILL, 'geo'), dest, { recursive: true });
  const md = join(dest, 'SKILL.md');
  writeFileSync(md, readFileSync(md, 'utf8').replaceAll('{{ENGINE_VERSION}}', VERSION));
  writeFileSync(join(dest, 'references', 'rules.md'), `${RULE_GUIDE}\n`);
}

const HEADER = '<!-- Generated by scripts/build-plugins.mjs from skill/. Edit the source, not this file. -->\n\n';

function writeFile(path, content) {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, content);
}

// Claude Code and GitHub Copilot CLI share one plugin directory: both read
// .claude-plugin/plugin.json, agents/ and skills/<name>/SKILL.md. Agents use the
// .agent.md suffix Copilot expects; Claude Code names them by front matter.
function buildPlugin(out) {
  const dir = join(out, 'geopilot');
  const ref = (n) => `\`${n}\` subagent (geopilot:${n})`;
  writeFile(join(dir, '.claude-plugin', 'plugin.json'), `${JSON.stringify({
    name: 'geopilot',
    displayName: 'GeoPilot',
    version: VERSION,
    description: 'GEO technical-readiness agents for websites: scan, fix with approval and honest verification, review changes, investigate and explain — driving the geopilot CLI.',
    author: { name: 'Mohamed Elzanaty', url: 'https://github.com/moelzanaty3' },
    homepage: 'https://moelzanaty3.github.io/geopilot/',
    repository: 'https://github.com/moelzanaty3/geopilot',
    license: 'Apache-2.0',
    keywords: ['geo', 'seo', 'robots-txt', 'sitemap', 'nextjs', 'audit'],
    icon: './assets/icon.png',
  }, null, 2)}\n`);
  mkdirSync(join(dir, 'assets'), { recursive: true });
  cpSync(join(SKILL, 'assets', 'icon.png'), join(dir, 'assets', 'icon.png'));
  for (const a of AGENTS) {
    writeFile(join(dir, 'agents', `${a.meta.name}.agent.md`), `${frontmatter({ name: a.meta.name, description: a.meta.description })}${HEADER}${render(a.body, ref).trim()}\n`);
  }
  copyGeoSkill(join(dir, 'skills', 'geo'));
  for (const c of COMMANDS) {
    writeFile(join(dir, 'skills', c.meta.name, 'SKILL.md'), `${frontmatter({
      name: c.meta.name,
      description: c.meta.description,
      'argument-hint': c.meta['argument-hint'],
      'disable-model-invocation': c.meta.userOnly === true ? true : undefined,
    })}${HEADER}${render(c.body, ref).trim()}\n`);
  }
  writeFile(join(dir, 'README.md'), `${HEADER}# GeoPilot plugin\n\nAgents: ${AGENTS.map((a) => `\`${a.meta.name}\``).join(', ')}. Commands (skills): ${COMMANDS.map((c) => `\`/geopilot:${c.meta.name}\``).join(', ')}.\n\nEngine: geopilot ${VERSION}.\n\n## Install\n\nClaude Code:\n\n    /plugin install geopilot --marketplace moelzanaty3/geopilot\n\nor, on older versions:\n\n    /plugin marketplace add moelzanaty3/geopilot\n    /plugin install geopilot@geopilot\n\nGitHub Copilot CLI:\n\n    copilot plugin marketplace add moelzanaty3/geopilot\n    copilot plugin install geopilot@geopilot\n\nMore: https://moelzanaty3.github.io/geopilot/docs/agent/\n`);
}

// Project-scoped files for `geopilot agent install --host claude-code`: no
// plugin namespace, so names carry a geopilot- prefix.
function buildClaudeProject(out) {
  const dir = join(out, 'claude-project', '.claude');
  const ref = (n) => `\`geopilot-${n}\` subagent`;
  for (const a of AGENTS) {
    writeFile(join(dir, 'agents', `geopilot-${a.meta.name}.md`), `${frontmatter({ name: `geopilot-${a.meta.name}`, description: a.meta.description })}${HEADER}${render(a.body, ref).trim()}\n`);
  }
  copyGeoSkill(join(dir, 'skills', 'geo'));
  for (const c of COMMANDS) {
    writeFile(join(dir, 'skills', `geopilot-${c.meta.name}`, 'SKILL.md'), `${frontmatter({
      name: `geopilot-${c.meta.name}`,
      description: c.meta.description,
      'argument-hint': c.meta['argument-hint'],
      'disable-model-invocation': c.meta.userOnly === true ? true : undefined,
    })}${HEADER}${render(c.body, ref).trim()}\n`);
  }
}

// OpenCode: .opencode/agents/<name>.md (file name is the agent name),
// .opencode/commands/<name>.md, .opencode/skills/<name>/SKILL.md.
function buildOpencode(out) {
  const dir = join(out, 'opencode', '.opencode');
  const ref = (n) => `\`geopilot-${n}\` agent`;
  for (const a of AGENTS) {
    const permission = a.meta.readOnly === true ? { edit: 'deny', webfetch: 'deny' } : { edit: 'ask', webfetch: 'deny' };
    writeFile(join(dir, 'agents', `geopilot-${a.meta.name}.md`), `${frontmatter({ description: a.meta.description, mode: 'subagent', permission })}${HEADER}${render(a.body, ref).trim()}\n`);
  }
  for (const c of COMMANDS) {
    writeFile(join(dir, 'commands', `geopilot-${c.meta.name}.md`), `${frontmatter({ description: c.meta.description, agent: c.meta.agent ? `geopilot-${c.meta.agent}` : undefined })}${HEADER}${render(c.body, ref).trim()}\n`);
  }
  copyGeoSkill(join(dir, 'skills', 'geo'));
}

// Codex skills get no argument substitution; the request itself carries the arguments.
const codexText = (text, ref) => render(text, ref).replaceAll('$ARGUMENTS', 'the target or arguments in my request');

// An explicit-only skill: Codex reads this policy from agents/openai.yaml beside SKILL.md.
function writeCodexSkill(dir, name, command, body) {
  writeFile(join(dir, name, 'SKILL.md'), `${frontmatter({ name, description: command.meta.description })}${HEADER}${body}\n`);
  if (command.meta.userOnly === true) writeFile(join(dir, name, 'agents', 'openai.yaml'), 'policy:\n  allow_implicit_invocation: false\n');
}

// Codex plugins carry skills but not custom agents, so each command skill also
// holds the instructions of the agent it would otherwise delegate to.
function buildCodexPlugin(out) {
  const dir = join(out, 'codex');
  const ref = (n) => `\`${n}\` instructions below as your`;
  writeFile(join(dir, 'plugin.json'), `${JSON.stringify({
    $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
    name: 'geopilot',
    version: VERSION,
    description: 'GEO technical-readiness skills for websites: scan, fix with approval and honest verification, review changes, investigate and explain, driving the geopilot CLI.',
    author: { name: 'Mohamed Elzanaty', url: 'https://github.com/moelzanaty3' },
    homepage: 'https://moelzanaty3.github.io/geopilot/',
    repository: 'https://github.com/moelzanaty3/geopilot',
    license: 'Apache-2.0',
    keywords: ['geo', 'seo', 'robots-txt', 'sitemap', 'nextjs', 'audit'],
  }, null, 2)}\n`);
  copyGeoSkill(join(dir, 'skills', 'geo'));
  for (const c of COMMANDS) {
    const agent = AGENTS.find((a) => a.meta.name === c.meta.agent);
    const body = codexText(c.body, ref).trim();
    writeCodexSkill(join(dir, 'skills'), c.meta.name, c, agent ? `${body}\n\n${render(agent.body, ref).trim()}` : body);
  }
}

// Project files for `geopilot agent install --host codex`: real custom agents in
// .codex/agents, skills in .agents/skills. Codex can't give one agent its own
// sandbox, so these descriptions don't claim read-only: only the session can enforce it.
function buildCodexProject(out) {
  const dir = join(out, 'codex-project');
  const ref = (n) => `\`geopilot-${n}\` custom`;
  const tomlBlock = (text) => `"""\n${text.replaceAll('\\', '\\\\').replaceAll('"""', '\\"\\"\\"')}\n"""`;
  for (const a of AGENTS) {
    writeFile(join(dir, '.codex', 'agents', `geopilot-${a.meta.name}.toml`), `# Generated by scripts/build-plugins.mjs from skill/. Edit the source, not this file.\nname = ${JSON.stringify(`geopilot-${a.meta.name}`)}\ndescription = ${JSON.stringify(a.meta.description.replace(/\s*Read-only\./, ''))}\ndeveloper_instructions = ${tomlBlock(render(a.body, ref).trim())}\n`);
  }
  copyGeoSkill(join(dir, '.agents', 'skills', 'geo'));
  for (const c of COMMANDS) writeCodexSkill(join(dir, '.agents', 'skills'), `geopilot-${c.meta.name}`, c, codexText(c.body, ref).trim());
}

function codexMarketplace() {
  return `${JSON.stringify({
    name: 'geopilot',
    interface: { displayName: 'geopilot' },
    plugins: [
      {
        name: 'geopilot',
        source: { source: 'local', path: './plugins/codex' },
        policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
        category: 'Developer Tools',
      },
    ],
  }, null, 2)}\n`;
}

function marketplace() {
  return `${JSON.stringify({
    name: 'geopilot',
    description: 'GEO technical-readiness agents and the geopilot CLI skill',
    owner: { name: 'Mohamed Elzanaty', url: 'https://github.com/moelzanaty3' },
    plugins: [
      {
        name: 'geopilot',
        source: './plugins/geopilot',
        description: 'Scan, fix, review, investigate and explain GEO technical readiness with the geopilot CLI',
        category: 'development',
        tags: ['geo', 'seo', 'audit', 'nextjs'],
      },
    ],
  }, null, 2)}\n`;
}

function build(out) {
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  buildPlugin(out);
  buildClaudeProject(out);
  buildOpencode(out);
  buildCodexPlugin(out);
  buildCodexProject(out);
}

function listFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const n of readdirSync(d).sort()) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(relative(dir, p));
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

if (CHECK) {
  const tmp = mkdtempSync(join(tmpdir(), 'geopilot-plugins-'));
  build(tmp);
  const want = listFiles(tmp);
  const have = listFiles(OUT);
  const stale = [...new Set([...want, ...have])].filter((f) => !existsSync(join(OUT, f)) || !existsSync(join(tmp, f)) || readFileSync(join(OUT, f), 'utf8') !== readFileSync(join(tmp, f), 'utf8'));
  if (!existsSync(MARKETPLACE) || readFileSync(MARKETPLACE, 'utf8') !== marketplace()) stale.push('.claude-plugin/marketplace.json');
  if (!existsSync(CODEX_MARKETPLACE) || readFileSync(CODEX_MARKETPLACE, 'utf8') !== codexMarketplace()) stale.push('.agents/plugins/marketplace.json');
  rmSync(tmp, { recursive: true, force: true });
  if (stale.length > 0) {
    console.error(`plugins/ is stale (${stale.length} file(s)): ${stale.slice(0, 10).join(', ')}\nRun: node scripts/build-plugins.mjs`);
    process.exit(1);
  }
  console.log(`plugins/ is current (${want.length} files, engine ${VERSION})`);
} else {
  build(OUT);
  if (!flag('--out')) {
    writeFile(MARKETPLACE, marketplace());
    writeFile(CODEX_MARKETPLACE, codexMarketplace());
  }
  console.log(`wrote ${relative(ROOT, OUT) || OUT} at engine ${VERSION}`);
}
