import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { cpSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { palette } from '../src/core/tty.ts';
import type { Io } from '../src/cli/io.ts';
import type { Evaluation, Finding, RuleId, Status, Subject } from '../src/types.ts';

export const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));

export interface Recorded {
  readonly status: number;
  readonly headers?: Record<string, string>;
  readonly body?: string;
}

/** A local fixture server that replays recorded exchanges (spec 15). */
export async function fixtureServer(routes: Record<string, Recorded | ((req: IncomingMessage) => Recorded)>): Promise<{ origin: string; close: () => Promise<void>; hits: string[] }> {
  const hits: string[] = [];
  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const path = req.url ?? '/';
    hits.push(path);
    const entry = routes[path];
    const r = typeof entry === 'function' ? entry(req) : entry ?? { status: 404, headers: { 'content-type': 'text/plain' }, body: 'not found' };
    res.writeHead(r.status, { 'content-type': 'text/html; charset=utf-8', ...(r.headers ?? {}) });
    res.end(r.body ?? '');
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return {
    origin: `http://127.0.0.1:${port}`,
    hits,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

export interface CapturedIo extends Io {
  readonly stdout: () => string;
  readonly stderr: () => string;
}

export function captureIo(opts: { interactive?: boolean; answers?: string[]; env?: NodeJS.ProcessEnv } = {}): CapturedIo {
  let out = '';
  let err = '';
  const answers = [...(opts.answers ?? [])];
  return {
    out: (t) => {
      out += t;
    },
    err: (t) => {
      err += t;
    },
    interactive: opts.interactive ?? false,
    color: palette(false),
    errColor: palette(false),
    confirm: async () => /^y/i.test(answers.shift() ?? 'n'),
    ask: async () => answers.shift() ?? '',
    env: opts.env ?? {},
    stdout: () => out,
    stderr: () => err,
  };
}

/** Copy a fixture into a fresh git repository on a feature branch. */
export function gitFixture(name: string): string {
  const dir = mkdtempSync(join(tmpdir(), `geo-${name}-`));
  cpSync(join(FIXTURES, name), dir, { recursive: true });
  const git = (...args: string[]): void => {
    execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  };
  git('init', '-q', '-b', 'feature');
  git('add', '-A');
  git('-c', 'user.email=t@example.com', '-c', 'user.name=t', 'commit', '-qm', 'fixture');
  return dir;
}

interface FixtureEval {
  ruleId: RuleId;
  subject: Subject;
  status: Status;
  evidenceQuality: Evaluation['evidenceQuality'];
  statusReason?: Evaluation['statusReason'];
  findings?: { subCheck: string; capReason?: string }[];
}

export function toEvaluation(e: FixtureEval): Evaluation {
  const findings: Finding[] = (e.findings ?? []).map((f, i) => ({
    fingerprint: `geo1:${e.ruleId}:${String(i).padStart(12, '0')}`,
    ruleId: e.ruleId,
    subCheck: f.subCheck,
    severity: 'medium',
    message: 'fixture',
    evidence: [],
    docs: '',
    provenance: { level: 'unmapped', locations: [], reason: 'fixture' },
    fixes: [],
    evidenceQuality: e.evidenceQuality,
    ...(f.capReason ? { capReason: f.capReason } : {}),
  }));
  return {
    ruleId: e.ruleId,
    subject: e.subject,
    status: e.status,
    evidenceQuality: e.evidenceQuality,
    ...(e.statusReason ? { statusReason: e.statusReason } : {}),
    subChecks: [],
    findings,
  };
}

/** Seeded PRNG (mulberry32) so property-test failures reproduce. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
