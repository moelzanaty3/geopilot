// The config's "$schema" URL points at the docs site, so the published JSON
// Schemas are copied into the static export from the package — one source.
import { cpSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const from = fileURLToPath(new URL('../../packages/geopilot/schemas/', import.meta.url));
const to = fileURLToPath(new URL('../public/schema/', import.meta.url));
for (const [file, dir] of [['config-v1.json', 'config'], ['report-v1.json', 'report'], ['insights-v1.json', 'insights'], ['merged-v1.json', 'merged']]) {
  mkdirSync(`${to}${dir}`, { recursive: true });
  cpSync(`${from}${file}`, `${to}${dir}/v1.json`);
}
