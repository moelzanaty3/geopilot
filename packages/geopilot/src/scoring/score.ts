import { ruleMeta } from '../rules/catalogue.ts';
import { subjectKey, type AssessmentScope, type Evaluation, type Readiness, type RuleId } from '../types.ts';

// Spec 10.1. Readiness counts direct evidence only; coverage and confidence are
// separate outputs and are never folded into it. All arithmetic is unrounded;
// display rounds half away from zero exactly once.

export interface Score {
  readonly readiness: Readiness;
  readonly coverage: number;
  readonly confidence: number | null;
  readonly assessmentScope: AssessmentScope;
}

interface Partition {
  dp: number;
  df: number;
  i: number;
  u: number;
}

export const CAP = 40;

export function roundHalfAwayFromZero(x: number): number {
  return Math.sign(x) * Math.round(Math.abs(x));
}

function isDirect(e: Evaluation): boolean {
  return e.evidenceQuality === 'direct' || e.evidenceQuality === 'partial';
}

export function partition(evaluations: readonly Evaluation[]): Map<RuleId, Partition> {
  const out = new Map<RuleId, Partition>();
  for (const e of evaluations) {
    const meta = ruleMeta(e.ruleId);
    if (!meta.scored || e.status === 'not_applicable') continue;
    const p = out.get(e.ruleId) ?? { dp: 0, df: 0, i: 0, u: 0 };
    if (e.status === 'not_evaluated' || e.status === 'error') p.u++;
    else if (e.evidenceQuality === 'inferred') p.i++;
    else if (e.status === 'pass') p.dp++;
    else p.df++;
    out.set(e.ruleId, p);
  }
  return out;
}

export function capReasons(evaluations: readonly Evaluation[]): string[] {
  const reasons = new Set<string>();
  for (const e of evaluations) {
    if (e.status !== 'fail' || !isDirect(e)) continue;
    for (const f of e.findings) if (f.capReason) reasons.add(f.capReason);
  }
  // Site-wide means every applicable subject, not every subject that happened to be evaluated.
  const g014 = evaluations.filter((e) => e.ruleId === 'GEO-014' && e.status !== 'not_applicable');
  if (g014.length > 0 && g014.every((e) => e.status === 'fail' && isDirect(e) && e.findings.some((f) => f.subCheck === 'meta_noindex' || f.subCheck === 'header_noindex'))) {
    reasons.add('GEO-014: every sampled route is noindex');
  }
  return [...reasons].sort();
}

export function score(evaluations: readonly Evaluation[], weightOf: (id: RuleId) => number = (id) => ruleMeta(id).weight): Score {
  const parts = partition(evaluations);
  let rdNum = 0;
  let rdDen = 0;
  let covNum = 0;
  let covDen = 0;
  let confNum = 0;
  let confDen = 0;
  for (const [id, p] of parts) {
    const w = weightOf(id);
    const d = p.dp + p.df;
    if (d > 0) {
      rdNum += w * (1 - p.df / d);
      rdDen += w;
    }
    const a = d + p.i + p.u;
    if (a > 0) {
      covNum += (w * d) / a;
      covDen += w;
    }
    if (d + p.i > 0) {
      confNum += (w * d) / (d + p.i);
      confDen += w;
    }
  }
  const uncapped = rdDen > 0 ? (100 * rdNum) / rdDen : null;
  const coverage = covDen > 0 ? (100 * covNum) / covDen : 0;
  const confidence = confDen > 0 ? (100 * confNum) / confDen : null;
  const caps = uncapped === null ? [] : capReasons(evaluations);
  const value = uncapped === null ? null : caps.length > 0 ? Math.min(uncapped, CAP) : uncapped;
  const display = value === null || coverage < 50 ? 'insufficient_evidence' : coverage < 80 ? 'provisional' : 'readiness';

  const direct: { ruleId: RuleId; subject: string }[] = [];
  const needsRuntime = new Set<RuleId>();
  for (const e of evaluations) {
    if (!ruleMeta(e.ruleId).scored || e.status === 'not_applicable') continue;
    if ((e.status === 'pass' || e.status === 'fail') && isDirect(e)) direct.push({ ruleId: e.ruleId, subject: subjectKey(e.subject) });
    if (e.status === 'not_evaluated' && (e.statusReason === 'incomplete_subchecks' || e.statusReason === 'needs_url')) needsRuntime.add(e.ruleId);
  }
  direct.sort((a, b) => (a.ruleId === b.ruleId ? (a.subject < b.subject ? -1 : 1) : a.ruleId < b.ruleId ? -1 : 1));
  const anyApplicable = [...parts.values()].some((p) => p.dp + p.df + p.i + p.u > 0);
  const unassessed = [...parts.values()].some((p) => p.u > 0 || p.i > 0);
  const assessment: AssessmentScope['assessment'] = !anyApplicable || uncapped === null ? 'incomplete' : unassessed ? 'partial' : 'complete';
  const notes: string[] = [];
  if (needsRuntime.size > 0) notes.push(`${needsRuntime.size} rule${needsRuntime.size === 1 ? ' needs' : 's need'} runtime evidence — re-run with --url`);
  const renderer = evaluations.filter((e) => e.statusReason === 'renderer_unavailable').map((e) => e.ruleId);
  if (renderer.length > 0) notes.push(`${[...new Set(renderer)].join(', ')} need a renderer; this release ships none, so they are not evaluated`);
  return {
    readiness: { value, uncapped, capReason: caps.length > 0 ? caps.join('; ') : null, display },
    coverage,
    confidence,
    assessmentScope: { assessment, direct, needsRuntime: [...needsRuntime].sort(), notes },
  };
}

export function displayReadiness(r: Readiness): string {
  if (r.value === null || r.display === 'insufficient_evidence') return 'insufficient evidence';
  const n = roundHalfAwayFromZero(r.value);
  return r.display === 'provisional' ? `${n} (provisional)` : String(n);
}

export function displayPercent(x: number | null): string {
  return x === null ? 'n/a' : `${roundHalfAwayFromZero(x)}%`;
}
