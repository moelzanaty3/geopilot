import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// Read at build time from the repository, so every number the site prints is
// the number the engine's own fixtures assert.

const ROOT = join(process.cwd(), '..');

export function engineVersion(): string {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'packages', 'trace-rank', 'package.json'), 'utf8')) as { version: string };
  return pkg.version;
}

export interface ScoringExample {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly expected: {
    readonly readinessDisplay: string;
    readonly coverageDisplay: string;
    readonly confidenceDisplay: string;
    readonly capReason: string | null;
    readonly formula: string;
    readonly display: string;
  };
}

export function scoringExamples(): ScoringExample[] {
  const dir = join(ROOT, 'packages', 'trace-rank', 'test', 'fixtures', 'scoring');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as ScoringExample);
}

export function adrs(): { slug: string; title: string; body: string }[] {
  const dir = join(ROOT, 'docs', 'adr');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => {
      const text = readFileSync(join(dir, f), 'utf8');
      const title = /^#\s+(.+)$/m.exec(text)?.[1] ?? f;
      return { slug: f.replace(/\.md$/, ''), title, body: text.replace(/^#\s+.+\n/, '').trim() };
    });
}
