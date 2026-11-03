import { sha256 } from '../core/hash.ts';
import { ruleDocsUrl, ruleMeta } from './catalogue.ts';
import type { GeoConfig } from '../config/config.ts';
import {
  subjectKey,
  type Evaluation,
  type Evidence,
  type EvidenceQuality,
  type Finding,
  type Provenance,
  type RuleId,
  type StatusReason,
  type SubCheckResult,
  type SubCheckScope,
  type Subject,
} from '../types.ts';

export interface FindingDraft {
  readonly subCheck: string;
  readonly message: string;
  readonly evidence: readonly Evidence[];
  readonly provenance: Provenance;
  /** Extra stable anchor (e.g. a crawler token) when one sub-check yields several findings. */
  readonly anchor?: string;
  readonly capReason?: string;
}

export interface SubOutcome {
  readonly id: string;
  readonly status: SubCheckResult['status'];
  readonly reason?: string;
  readonly findings?: readonly FindingDraft[];
}

export function fingerprint(ruleId: RuleId, subject: Subject, anchor: string): string {
  return `geo1:${ruleId}:${sha256(`${ruleId}|${subjectKey(subject)}|${anchor}`).slice(0, 12)}`;
}

export const pass = (id: string): SubOutcome => ({ id, status: 'pass' });
export const notRun = (id: string, reason: string): SubOutcome => ({ id, status: 'not_run', reason });
export const notApplicable = (id: string, reason: string): SubOutcome => ({ id, status: 'not_applicable', reason });
export const fail = (id: string, findings: readonly FindingDraft[]): SubOutcome => ({ id, status: 'fail', findings });

export function scopeOf(ruleId: RuleId, subCheck: string): SubCheckScope {
  return ruleMeta(ruleId).subChecks.find((s) => s.id === subCheck)?.scope ?? 'both';
}

/**
 * ADR-019: a fail on any evaluated sub-check fails the subject; all evaluated
 * passing with any applicable sub-check unrun is not_evaluated
 * (incomplete_subchecks); only a full set of passes is a pass.
 */
export function finalize(
  config: GeoConfig,
  ruleId: RuleId,
  subject: Subject,
  outcomes: readonly SubOutcome[],
  opts: { quality?: EvidenceQuality; noneReason?: StatusReason; sampledUrls?: readonly string[] } = {},
): Evaluation {
  const meta = ruleMeta(ruleId);
  const override = config.rules[ruleId];
  const severity = typeof override === 'object' ? override.severity : meta.severity;
  const subChecks: SubCheckResult[] = outcomes.map((o) => ({
    id: o.id,
    scope: scopeOf(ruleId, o.id),
    status: o.status,
    ...(o.reason === undefined ? {} : { reason: o.reason }),
  }));
  const applicable = outcomes.filter((o) => o.status !== 'not_applicable');
  const quality = opts.quality ?? 'direct';
  const findings: Finding[] = [];
  for (const o of outcomes) {
    for (const d of o.findings ?? []) {
      findings.push({
        fingerprint: fingerprint(ruleId, subject, d.anchor ? `${o.id}:${d.anchor}` : o.id),
        ruleId,
        subCheck: o.id,
        severity,
        message: d.message,
        evidence: d.evidence,
        docs: ruleDocsUrl(ruleId),
        provenance: d.provenance,
        fixes: [],
        evidenceQuality: quality,
        ...(d.capReason ? { capReason: d.capReason } : {}),
      });
    }
  }
  findings.sort((a, b) => (a.fingerprint < b.fingerprint ? -1 : 1));
  const base = { ruleId, subject, subChecks, findings, ...(opts.sampledUrls ? { sampledUrls: opts.sampledUrls } : {}) };
  if (applicable.length === 0) {
    const reason = (outcomes[0]?.reason as StatusReason | undefined) ?? opts.noneReason ?? 'not_in_scope';
    return { ...base, status: 'not_applicable', statusReason: reason, evidenceQuality: quality };
  }
  if (applicable.some((o) => o.status === 'fail')) return { ...base, status: 'fail', evidenceQuality: quality };
  if (applicable.every((o) => o.status === 'pass')) return { ...base, status: 'pass', evidenceQuality: quality };
  if (applicable.some((o) => o.status === 'pass')) {
    return { ...base, status: 'not_evaluated', statusReason: 'incomplete_subchecks', evidenceQuality: quality };
  }
  const reason = (applicable.find((o) => o.reason)?.reason ?? opts.noneReason ?? 'needs_url') as StatusReason;
  return { ...base, status: 'not_evaluated', statusReason: KNOWN_REASONS.has(reason) ? reason : 'needs_url', evidenceQuality: quality };
}

const KNOWN_REASONS = new Set<string>([
  'incomplete_subchecks',
  'needs_url',
  'renderer_unavailable',
  'origin_not_declared',
  'policy_undecided',
  'no_jsonld',
  'web_profile',
  'not_in_scope',
  'auth_walled',
  'unreachable',
  'dynamic_source',
  'entry_route',
  'rule_disabled',
  'no_subjects',
  'internal_error',
]);

export function errorEvaluation(ruleId: RuleId, subject: Subject, message: string): Evaluation {
  return {
    ruleId,
    subject,
    status: 'error',
    statusReason: 'unreachable',
    evidenceQuality: 'direct',
    subChecks: [{ id: 'fetch', scope: 'url', status: 'not_run', reason: message }],
    findings: [],
  };
}
