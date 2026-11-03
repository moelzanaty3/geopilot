#!/usr/bin/env node
// Pack this working tree and install it as the global `geopilot`, the same way a
// user gets the published package, so it can be reviewed before it reaches npm.
//
//   pnpm publish:local         build, pack, install globally, verify
//   pnpm publish:local:clean   remove the global install
//
// Nothing reaches the registry. Ported from redline's script; every step below
// exists because the plain `npm i -g` version fails silently on a Volta machine.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PACKAGE_DIR = fileURLToPath(new URL('../packages/geopilot/', import.meta.url));
const VOLTA_BIN = join(process.env.HOME ?? '', '.volta', 'bin');

// Volta sets this on everything it launches and its shims skip their hook when they
// see it, so a global install started from here would never update the `geopilot`
// shim. Clearing it restores the behaviour of typing the command in a shell.
const env = { ...process.env };
delete env._VOLTA_TOOL_RECURSION;

function quiet(file, args) {
  try {
    return execFileSync(file, args, { encoding: 'utf8', env, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

// Under pnpm, `npm` resolves to the copy semantic-release pulled into node_modules/.bin.
// Its global prefix is not the one the `geopilot` on PATH comes from, so the install
// would report success and change nothing. Under Volta it has to be the shim itself.
function resolveNpm() {
  const shim = join(VOLTA_BIN, 'npm');
  if (existsSync(shim)) return shim;
  for (const dir of (process.env.PATH ?? '').split(':')) {
    if (dir === '' || dir.includes('node_modules')) continue;
    const candidate = join(dir, 'npm');
    if (existsSync(candidate)) return candidate;
  }
  return 'npm';
}

const npm = resolveNpm();
const hasVolta = quiet('volta', ['--version']) !== '';

// Volta runs its own copy of a global package, apart from the one npm writes. It has
// to go before the install, or the shim keeps executing the old build.
function uninstallFromVolta() {
  if (hasVolta) quiet('volta', ['uninstall', 'geopilot']);
}

if (process.argv.includes('--clean')) {
  uninstallFromVolta();
  quiet(npm, ['rm', '-g', 'geopilot']);
  console.log('  removed the global geopilot');
  process.exit(0);
}

// package.json carries 0.0.0-development permanently because semantic-release sets the
// real version. npm and Volta cache a global package by name@version, so a repeat
// install would be served the first build. A unique version defeats both caches and
// makes `geopilot --version` prove which build is running.
const manifestPath = join(PACKAGE_DIR, 'package.json');
const original = readFileSync(manifestPath, 'utf8');
const localVersion = `0.0.0-local.${Math.floor(Date.now() / 1000)}`;
const tarball = join(PACKAGE_DIR, `geopilot-${localVersion}.tgz`);

uninstallFromVolta();

try {
  writeFileSync(manifestPath, JSON.stringify({ ...JSON.parse(original), version: localVersion }, null, 2) + '\n');
  execFileSync(npm, ['pack'], { cwd: PACKAGE_DIR, env, stdio: 'inherit' });
  execFileSync(npm, ['i', '-g', tarball], { cwd: PACKAGE_DIR, env, stdio: 'inherit' });
} finally {
  // Has to survive a failed build, or a timestamp version ends up committed.
  writeFileSync(manifestPath, original);
  rmSync(tarball, { force: true });
}

// Run the command a person would type. Volta's shim first: it is what an interactive
// shell runs, and a non-interactive PATH can resolve to a different copy.
const shim = join(VOLTA_BIN, 'geopilot');
const installed = quiet(existsSync(shim) ? shim : 'geopilot', ['--version']);
if (installed !== localVersion) {
  console.error(`\n  The installed geopilot is stale: it reports "${installed}", this build is ${localVersion}.`);
  console.error('  Check your PATH, then run: pnpm publish:local:clean && pnpm publish:local\n');
  process.exit(1);
}
console.log(`\n  geopilot on your PATH runs this build (${localVersion})`);
