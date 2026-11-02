import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { displayPercent, displayReadiness, roundHalfAwayFromZero, score } from '../src/scoring/score.ts';
import { compareReports } from '../src/scoring/compare.ts';
import { SCORED_RULES } from '../src/rules/catalogue.ts';
import type { Evaluation, Report, RuleId, Status } from '../src/types.ts';
import { FIXTURES, rng, toEvaluation } from './helpers.ts';

const DIR = join(FIXTURES, 'scoring');
const close = (a: number | null, b: number | null): boolean => (a === null || b === null ? a === b : Math.abs(a - b) < 1e-9);

describe('scoring fixtures A–E (normative, spec 10.2)', () => {
  for (const file of readdirSync(DIR).filter((f) => f.endsWith('.json')).sort()) {
    const fx = JSON.parse(readFileSync(join(DIR, file), 'utf8'));
    it(`${fx.id}: ${fx.title}`, () => {
      const s = score(fx.evaluations.map(toEvaluation));
      assert.ok(close(s.readiness.value, fx.expected.readiness), `readiness ${s.readiness.value} != ${fx.expected.readiness}`);
      assert.ok(close(s.readiness.uncapped, fx.expected.uncapped), `uncapped ${s.readiness.uncapped}`);
      assert.ok(close(s.coverage, fx.expected.coverage), `coverage ${s.coverage}`);
      assert.ok(close(s.confidence, fx.expected.confidence), `confidence ${s.confidence}`);
      assert.equal(s.readiness.display, fx.expected.display);
      assert.equal(s.readiness.capReason, fx.expected.capReason);
      assert.equal(displayReadiness(s.readiness), fx.expected.readinessDisplay);
      assert.equal(displayPercent(s.coverage), fx.expected.coverageDisplay);
      assert.equal(displayPercent(s.confidence), fx.expected.confidenceDisplay);
    });
  }
  it('rounds half away from zero, once', () => {
    assert.equal(roundHalfAwayFromZero(2.5), 3);
    assert.equal(roundHalfAwayFromZero(-2.5), -3);
    assert.equal(roundHalfAwayFromZero(96.4912), 96);
  });
});

// ------------------------------------------------------------- properties

const CASES = 10_000;
const RULE_IDS = SCORED_RULES.map((r) => r.id);
const STATUSES: Status[] = ['pass', 'fail', 'not_applicable', 'not_evaluated', 'error'];

function genEvals(r: () => number): Evaluation[] {
  const out: Evaluation[] = [];
  const n = 1 + Math.floor(r() * 30);
  for (let i = 0; i < n; i++) {
    const ruleId = RULE_IDS[Math.floor(r() * RULE_IDS.length)]!;
    const status = STATUSES[Math.floor(r() * STATUSES.length)]!;
    const q = r() < 0.2 && (status === 'pass' || status === 'fail') ? 'inferred' : r() < 0.1 ? 'partial' : 'direct';
    out.push(toEvaluation({ ruleId, subject: { kind: 'routeGroup', route: `/r${i}` }, status, evidenceQuality: q }));
  }
  return out;
}

function property(name: string, seed: number, check: (evals: Evaluation[], r: () => number) => void): void {
  it(`${name} (${CASES} cases)`, () => {
    const r = rng(seed);
    for (let i = 0; i < CASES; i++) check(genEvals(r), r);
  });
}

const nonNull = (x: number | null): number => (x === null ? -1 : x);

describe('scoring properties (spec 10.3)', () => {
  property('readiness, coverage and confidence stay within 0..100', 1, (e) => {
    const s = score(e);
    for (const v of [s.readiness.value, s.readiness.uncapped, s.coverage, s.confidence]) if (v !== null) assert.ok(v >= -1e-9 && v <= 100 + 1e-9);
  });
  property('readiness is null iff there is no direct pass/fail evidence', 2, (e) => {
    const hasDirect = e.some((x) => (x.status === 'pass' || x.status === 'fail') && x.evidenceQuality !== 'inferred');
    assert.equal(score(e).readiness.value === null, !hasDirect);
  });
  property('changing one fail to pass never decreases readiness', 3, (e, r) => {
    const fails = e.map((x, i) => [x, i] as const).filter(([x]) => x.status === 'fail' && x.evidenceQuality !== 'inferred');
    if (fails.length === 0) return;
    const [, idx] = fails[Math.floor(r() * fails.length)]!;
    const after = e.map((x, i) => (i === idx ? { ...x, status: 'pass' as const } : x));
    assert.ok(nonNull(score(after).readiness.uncapped) >= nonNull(score(e).readiness.uncapped) - 1e-9);
  });
  property('adding not_evaluated or error never improves coverage or readiness', 4, (e, r) => {
    const ruleId = RULE_IDS[Math.floor(r() * RULE_IDS.length)]!;
    const extra = toEvaluation({ ruleId, subject: { kind: 'routeGroup', route: '/extra' }, status: r() < 0.5 ? 'not_evaluated' : 'error', evidenceQuality: 'direct' });
    const before = score(e);
    const after = score([...e, extra]);
    assert.ok(after.coverage <= before.coverage + 1e-9);
    assert.ok(nonNull(after.readiness.uncapped) <= nonNull(before.readiness.uncapped) + 1e-9 || before.readiness.uncapped === null);
  });
  property('inferred evidence never affects readiness', 5, (e, r) => {
    const ruleId = RULE_IDS[Math.floor(r() * RULE_IDS.length)]!;
    const extra = toEvaluation({ ruleId, subject: { kind: 'routeGroup', route: '/inferred' }, status: r() < 0.5 ? 'pass' : 'fail', evidenceQuality: 'inferred' });
    assert.ok(close(score([...e, extra]).readiness.value, score(e).readiness.value));
  });
  property('order invariance', 6, (e, r) => {
    const shuffled = [...e].sort(() => r() - 0.5);
    const a = score(e);
    const b = score(shuffled);
    assert.ok(close(a.readiness.value, b.readiness.value) && close(a.coverage, b.coverage) && close(a.confidence, b.confidence));
  });
  property('group-sample invariance: duplicating every subject with the same status changes nothing', 7, (e) => {
    const doubled = [...e, ...e.map((x) => ({ ...x, subject: { kind: 'routeGroup' as const, route: `${(x.subject as { route: string }).route}-copy` } }))];
    const a = score(e);
    const b = score(doubled);
    assert.ok(close(a.readiness.value, b.readiness.value) && close(a.coverage, b.coverage) && close(a.confidence, b.confidence));
  });
  property('cap invariance: a cap never raises readiness and keeps the uncapped value', 8, (e) => {
    const capped = [...e, toEvaluation({ ruleId: 'GEO-013', subject: { kind: 'site' }, status: 'fail', evidenceQuality: 'direct', findings: [{ subCheck: 'reachability', capReason: 'GEO-013: robots.txt answered 5xx' }] })];
    const s = score(capped);
    assert.ok(s.readiness.value !== null && s.readiness.value <= 40 + 1e-9);
    assert.ok(s.readiness.uncapped !== null && s.readiness.value <= s.readiness.uncapped + 1e-9);
  });
  property('fail → not_evaluated/error is never reported as resolved', 9, (e, r) => {
    const base = report(e);
    const after = report(e.map((x) => (x.status === 'fail' ? { ...x, status: (r() < 0.5 ? 'not_evaluated' : 'error') as Status, findings: [] } : x)));
    assert.deepEqual(compareReports(base, after).resolved, []);
  });
  property('incomparable scopes suppress numeric deltas', 10, (e) => {
    const direct = e.filter((x) => (x.status === 'pass' || x.status === 'fail') && x.evidenceQuality !== 'inferred');
    if (direct.length === 0) return;
    const after = report(e.filter((x) => x !== direct[0]));
    const c = compareReports(report(e), after);
    assert.equal(c.comparable, false);
    assert.ok(!('delta' in c));
  });
  property('cross-version comparisons are never numeric', 11, (e) => {
    const a = report(e);
    const b = { ...report(e), tool: { ...a.tool, scoringVersion: '2.0.0' } };
    assert.equal(compareReports(a, b).comparable, false);
  });
});

function report(evals: Evaluation[]): Report {
  const s = score(evals);
  return {
    schemaVersion: 'geo-report/v1',
    tool: { name: 'trace-rank', version: '0', rulesetVersion: '1.0.0', scoringVersion: '1.0.0' },
    run: { id: 'r-0', startedAt: '', durationMs: 0, targets: [], mode: 'url', configHash: '', gitCommit: null, profile: 'web', ignoreRobots: false },
    framework: { id: 'unknown', state: 'unknown', version: null, confidence: 'low', capabilityTier: { urlAudit: 'T0', repo: null, provenance: null, fixes: null }, evidence: [] },
    routes: [],
    evaluations: evals,
    informational: [],
    readiness: s.readiness,
    coverage: s.coverage,
    confidence: s.confidence,
    assessmentScope: s.assessmentScope,
    suppressed: [],
    notices: [],
    baseline: null,
    disclaimer: '',
  };
}

describe('weights come from the catalogue', () => {
  it('web-profile weights sum to 25 (spec 10.2 example B)', () => {
    const web: RuleId[] = ['GEO-013', 'GEO-009', 'GEO-014', 'GEO-015', 'GEO-003', 'GEO-004', 'GEO-011', 'GEO-012', 'GEO-016', 'GEO-017', 'GEO-002'];
    assert.equal(SCORED_RULES.filter((r) => web.includes(r.id)).reduce((n, r) => n + r.weight, 0), 25);
  });
});
