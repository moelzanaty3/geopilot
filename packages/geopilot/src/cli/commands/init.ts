import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { EXIT, usage } from '../../core/errors.ts';
import { CONFIG_FILE, validateConfig } from '../../config/config.ts';
import { openRepo } from '../../repo/reader.ts';
import { detectFramework } from '../../repo/detect.ts';
import { GLOBAL_FLAGS, INIT_FLAGS, parseArgs } from '../args.ts';
import { gitRoot, resolveCwd, type Deps } from '../context.ts';

// init writes exactly two tool-managed files after a preview and approval:
// geo.config.json and .geo/.gitignore. It never infers origin, language,
// crawler policy or app identifiers, and never installs hooks.

function suggestServe(dir: string): string[] | null {
  const pm = existsSync(join(dir, 'pnpm-lock.yaml')) ? 'pnpm' : existsSync(join(dir, 'yarn.lock')) ? 'yarn' : existsSync(join(dir, 'bun.lock')) || existsSync(join(dir, 'bun.lockb')) ? 'bun' : 'npm';
  const runner = pm === 'npm' ? ['npx'] : pm === 'pnpm' ? ['pnpm', 'exec'] : pm === 'bun' ? ['bunx'] : ['yarn'];
  return [...runner, 'next', 'dev', '--port', '3100'];
}

export async function initCommand(argv: readonly string[], deps: Deps): Promise<number> {
  const p = parseArgs(argv, [...GLOBAL_FLAGS, ...INIT_FLAGS]);
  const cwd = resolveCwd(p, deps);
  const target = join(cwd, CONFIG_FILE);
  if (existsSync(target) && !p.bool.has('force')) throw usage(`${CONFIG_FILE} already exists`, 'Edit it by hand, or pass --force to replace it.');
  const io = deps.io;
  const framework = detectFramework(openRepo(cwd), 'auto');
  let origin = p.str.get('origin') ?? null;
  let language = p.str.get('language') ?? null;
  if (origin === null && io.interactive) origin = (await io.ask('Site origin (e.g. https://www.example.com, blank to skip): ')) || null;
  if (language === null && io.interactive) language = (await io.ask('Site language (BCP 47, e.g. en, blank to skip): ')) || null;

  const config: Record<string, unknown> = {
    $schema: 'https://moelzanaty3.github.io/geopilot/schema/config/v1.json',
    version: 1,
    framework: 'auto',
    site: { origin, language },
    routes: { include: ['/**'], exclude: ['/api/**'] },
    policy: { aiSearchCrawlers: 'allow', aiTrainingCrawlers: 'undecided', userTriggeredFetchers: 'allow' },
    fix: { verifyCommands: [], runtimeTimeoutSeconds: 60, serve: { command: null, url: null, readyTimeoutSeconds: 120 } },
  };
  const serve = framework.id === 'nextjs-app' ? suggestServe(cwd) : null;
  validateConfig(config);

  io.out(`Detected: ${framework.id} (${framework.state}); ${framework.evidence.slice(0, 3).join('; ') || 'no evidence'}\n`);
  io.out(`\nWill write ${CONFIG_FILE}:\n\n${JSON.stringify(config, null, 2)}\n\nand .geo/.gitignore (the run cache stays out of git).\n`);
  if (origin === null) io.out('\nsite.origin is not set. GEO never infers it; canonical checks and origin-dependent fixes stay unavailable until you set it.\n');
  if (serve) io.out(`\nSuggested (not written unless you accept): fix.serve.command ${JSON.stringify(serve)} with url http://127.0.0.1:3100.\nUse a from-source dev command: a command that serves stale prebuilt output defeats the freshness check.\n`);

  const approved = p.bool.has('yes') || (await io.confirm(`Write ${CONFIG_FILE}?`));
  if (!approved) throw usage('init needs approval: answer the prompt or pass --yes');
  if (serve && io.interactive && !p.bool.has('yes') && (await io.confirm('Also write the suggested serve command?'))) {
    config.fix = { verifyCommands: [], runtimeTimeoutSeconds: 60, serve: { command: serve, url: 'http://127.0.0.1:3100', readyTimeoutSeconds: 120 } };
  }
  writeFileSync(target, `${JSON.stringify(config, null, 2)}\n`);
  const geoDir = join(gitRoot(cwd) ?? cwd, '.geo');
  mkdirSync(geoDir, { recursive: true });
  if (!existsSync(join(geoDir, '.gitignore'))) writeFileSync(join(geoDir, '.gitignore'), '*\n');
  io.out(`wrote ${target}\n`);
  return EXIT.ok;
}
