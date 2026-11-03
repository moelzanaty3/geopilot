import { SCORED_RULES } from '../rules/catalogue.ts';
import type { Evaluation, Readiness, RuleId } from '../types.ts';

// One result per rule and one score range, used by the CLI and described word for
// word in skill/geo/references/scoring.md for the agents. A test holds the two together.

export type RuleResult = 'clear' | 'problem' | 'cant_tell' | 'not_applicable';
export type ScoreBand = 'Strong' | 'Good' | 'Needs work' | 'At risk';
export type ConfidenceLevel = 'High' | 'Medium' | 'Low';

export interface RuleSummary {
  readonly ruleId: RuleId;
  readonly result: RuleResult;
  readonly weight: number;
  readonly earned: number;
}

export interface ScoreSummary {
  /** Score if every Can't tell rule turns out to be a Problem. Null when nothing could be checked. */
  readonly low: number | null;
  /** Score if every Can't tell rule turns out to be Clear. Null when nothing could be checked. */
  readonly high: number | null;
  readonly band: ScoreBand | null;
  readonly earned: number;
  readonly checked: number;
  readonly applicable: number;
  readonly confidence: ConfidenceLevel | null;
  readonly rules: readonly RuleSummary[];
}

const CAP = 40;

// A live-only check never changes a code result, so a repository scan can be Clear
// while its live-only checks are still waiting. Readiness stays stricter on purpose.
function clearOnEveryCodeCheck(e: Evaluation): boolean {
  const codeChecks = e.subChecks.filter((c) => c.scope !== 'url');
  return e.statusReason === 'incomplete_subchecks' && codeChecks.length > 0 && codeChecks.every((c) => c.status === 'pass');
}

export function evaluationResult(e: Evaluation): RuleResult {
  if (e.evidenceQuality === 'inferred') return e.status === 'not_applicable' ? 'not_applicable' : 'cant_tell';
  if (e.status === 'pass') return 'clear';
  if (e.status === 'fail') return 'problem';
  if (e.status === 'not_applicable') return 'not_applicable';
  return clearOnEveryCodeCheck(e) ? 'clear' : 'cant_tell';
}

function summarizeRule(ruleId: RuleId, weight: number, evaluations: readonly Evaluation[], unevaluated: RuleResult): RuleSummary {
  const results = evaluations.map(evaluationResult);
  const count = (result: RuleResult) => results.filter((r) => r === result).length;
  const clear = count('clear');
  const problems = count('problem');
  if (problems > 0) return { ruleId, result: 'problem', weight, earned: (weight * clear) / (clear + problems) };
  if (count('cant_tell') > 0) return { ruleId, result: 'cant_tell', weight, earned: 0 };
  if (clear > 0) return { ruleId, result: 'clear', weight, earned: weight };
  return { ruleId, result: evaluations.length === 0 ? unevaluated : 'not_applicable', weight, earned: 0 };
}

export function bandFor(score: number): ScoreBand {
  return score >= 90 ? 'Strong' : score >= 70 ? 'Good' : score >= 50 ? 'Needs work' : 'At risk';
}

/** Pass `unevaluated: 'cant_tell'` when rules have no evaluations because the scan read nothing. */
export function summarize(evaluations: readonly Evaluation[], readiness: Pick<Readiness, 'capReason'>, unevaluated: RuleResult = 'not_applicable'): ScoreSummary {
  const rules = SCORED_RULES.map((rule) => summarizeRule(rule.id, rule.weight, evaluations.filter((e) => e.ruleId === rule.id), unevaluated));
  const sum = (result: RuleResult) => rules.filter((r) => r.result === result).reduce((total, r) => total + r.weight, 0);
  const checked = sum('clear') + sum('problem');
  const unknown = sum('cant_tell');
  const applicable = checked + unknown;
  const earned = rules.reduce((total, r) => total + r.earned, 0);
  if (checked === 0) return { low: null, high: null, band: null, earned: 0, checked: 0, applicable, confidence: null, rules };
  const capped = (score: number) => Math.round(readiness.capReason ? Math.min(score, CAP) : score);
  const low = capped((earned / applicable) * 100);
  const high = capped(((earned + unknown) / applicable) * 100);
  const share = checked / applicable;
  return { low, high, band: bandFor(low), earned, checked, applicable, confidence: share >= 0.8 ? 'High' : share >= 0.5 ? 'Medium' : 'Low', rules };
}

export function displayRange(summary: ScoreSummary): string {
  if (summary.low === null || summary.high === null) return 'no score yet';
  return summary.low === summary.high ? `${summary.low}/100` : `${summary.low}–${summary.high}/100`;
}
