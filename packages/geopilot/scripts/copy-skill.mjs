// The published package carries the canonical skill and every generated host
// bundle, so `agent install` works offline from an npx cache. They are rendered
// at the package's own version, which is the version the agents will pin.
// skill/ at the repository root stays the only copy a human edits.
import { cpSync, readFileSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const version = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;
const skillFrom = fileURLToPath(new URL('../hosts/geopilot/skills/geo/', import.meta.url));
const skillTo = fileURLToPath(new URL('../skill/geo/', import.meta.url));
execFileSync(process.execPath, [fileURLToPath(new URL('../../../scripts/build-plugins.mjs', import.meta.url)), '--out', fileURLToPath(new URL('../hosts/', import.meta.url)), '--version', version], { stdio: 'inherit' });
rmSync(fileURLToPath(new URL('../skill/', import.meta.url)), { recursive: true, force: true });
cpSync(skillFrom, skillTo, { recursive: true });
