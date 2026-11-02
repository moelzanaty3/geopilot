// The published package carries a copy of the canonical skill so `agent install`
// works offline from an npx cache. skill/geo/ at the repository root stays the
// only copy a human edits.
import { cpSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const from = fileURLToPath(new URL('../../../skill/', import.meta.url));
const to = fileURLToPath(new URL('../skill/', import.meta.url));
rmSync(to, { recursive: true, force: true });
cpSync(from, to, { recursive: true });
