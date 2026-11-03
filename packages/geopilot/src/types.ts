// The report contract (spec 8). Everything the engine emits is one of these
// shapes; the JSON schemas in schemas/ are written against this file.

export type RuleId =
  | 'GEO-002'
  | 'GEO-003'
  | 'GEO-004'
  | 'GEO-009'
  | 'GEO-010'
  | 'GEO-011'
  | 'GEO-012'
  | 'GEO-013'
  | 'GEO-014'
  | 'GEO-015'
  | 'GEO-016'
  | 'GEO-017'
  | 'GEO-101'
  | 'GEO-102';

export type Status = 'pass' | 'fail' | 'not_applicable' | 'not_evaluated' | 'error';
export type EvidenceQuality = 'direct' | 'partial' | 'inferred';
export type Severity = 'high' | 'medium' | 'low' | 'info';
export type SubCheckScope = 'repo' | 'url' | 'both';

export type Subject =
  | { readonly kind: 'site' }
  | { readonly kind: 'routeGroup'; readonly route: string }
  | { readonly kind: 'file'; readonly path: string };

export type ProvenanceLevel = 'exact' | 'file' | 'candidate' | 'unmapped' | 'absent';

export interface SourceLocation {
  readonly file: string;
  readonly line?: number;
  readonly column?: number;
  readonly endLine?: number;
}

export interface Provenance {
  readonly level: ProvenanceLevel;
  readonly locations: readonly SourceLocation[];
  readonly reason: string;
}

export interface Evidence {
  readonly kind: 'http' | 'html' | 'robots' | 'sitemap' | 'source' | 'config' | 'note';
  readonly url?: string;
  readonly file?: string;
  readonly line?: number;
  readonly status?: number;
  readonly header?: string;
  readonly selector?: string;
  readonly snippet?: string;
  readonly detail: string;
}

export interface FixProposalRef {
  readonly fixId: string;
  readonly variant: string;
  readonly class: FixClass;
}

export type FixClass = 'safe' | 'guarded' | 'contextual' | 'editorial' | 'unsupported';

export interface Finding {
  readonly fingerprint: string;
  readonly ruleId: RuleId;
  readonly subCheck: string;
  readonly severity: Severity;
  readonly message: string;
  readonly evidence: readonly Evidence[];
  readonly docs: string;
  readonly provenance: Provenance;
  readonly fixes: readonly FixProposalRef[];
  readonly evidenceQuality: EvidenceQuality;
  /** Set when this finding is one of the blocker conditions that cap readiness (spec 10.1). */
  readonly capReason?: string;
}

export interface SubCheckResult {
  readonly id: string;
  readonly scope: SubCheckScope;
  readonly status: 'pass' | 'fail' | 'not_run' | 'not_applicable';
  readonly reason?: string;
}

export type StatusReason =
  | 'incomplete_subchecks'
  | 'needs_url'
  | 'renderer_unavailable'
  | 'origin_not_declared'
  | 'policy_undecided'
  | 'no_jsonld'
  | 'web_profile'
  | 'not_in_scope'
  | 'auth_walled'
  | 'unreachable'
  | 'dynamic_source'
  | 'entry_route'
  | 'rule_disabled'
  | 'no_subjects'
  | 'internal_error';

export interface Evaluation {
  readonly ruleId: RuleId;
  readonly subject: Subject;
  readonly status: Status;
  readonly statusReason?: StatusReason;
  readonly evidenceQuality: EvidenceQuality;
  readonly subChecks: readonly SubCheckResult[];
  readonly findings: readonly Finding[];
  readonly sampledUrls?: readonly string[];
}

export type CapabilityTier = 'T0' | 'T1' | 'T2' | 'T3';
export type FrameworkId = 'nextjs-app' | 'static' | 'generic' | 'unknown';

export interface FrameworkInfo {
  readonly id: FrameworkId;
  readonly state: 'detected' | 'suspected' | 'unknown';
  readonly version: string | null;
  readonly confidence: 'high' | 'medium' | 'low';
  readonly capabilityTier: {
    readonly urlAudit: CapabilityTier | null;
    readonly repo: CapabilityTier | null;
    readonly provenance: CapabilityTier | null;
    readonly fixes: CapabilityTier | null;
  };
  readonly evidence: readonly string[];
}

export interface RouteInfo {
  readonly route: string;
  readonly urls: readonly string[];
  readonly files: readonly string[];
  readonly dynamic: boolean;
}

export type ReadinessDisplay = 'readiness' | 'provisional' | 'insufficient_evidence';

export interface Readiness {
  readonly value: number | null;
  readonly uncapped: number | null;
  readonly capReason: string | null;
  readonly display: ReadinessDisplay;
}

export interface AssessmentScope {
  readonly assessment: 'complete' | 'partial' | 'incomplete';
  readonly direct: readonly { readonly ruleId: RuleId; readonly subject: string }[];
  readonly needsRuntime: readonly RuleId[];
  readonly notes: readonly string[];
}

export interface Report {
  readonly schemaVersion: 'geo-report/v1';
  readonly tool: {
    readonly name: string;
    readonly version: string;
    readonly rulesetVersion: string;
    readonly scoringVersion: string;
  };
  readonly run: {
    readonly id: string;
    readonly startedAt: string;
    readonly durationMs: number;
    readonly targets: readonly string[];
    readonly mode: 'url' | 'repo' | 'mixed';
    readonly configHash: string;
    readonly gitCommit: string | null;
    readonly profile: 'web' | 'app';
    readonly ignoreRobots: boolean;
  };
  readonly framework: FrameworkInfo;
  readonly routes: readonly RouteInfo[];
  readonly evaluations: readonly Evaluation[];
  readonly informational: readonly InformationalObservation[];
  readonly readiness: Readiness;
  readonly coverage: number;
  readonly confidence: number | null;
  readonly assessmentScope: AssessmentScope;
  readonly suppressed: readonly SuppressedFinding[];
  readonly notices: readonly string[];
  readonly baseline: null;
  readonly disclaimer: string;
}

export interface InformationalObservation {
  readonly ruleId: RuleId;
  readonly message: string;
  readonly evidence: readonly Evidence[];
}

export interface SuppressedFinding {
  readonly fingerprint: string;
  readonly ruleId: RuleId;
  readonly reason: string;
  readonly expires: string | null;
}

export function subjectKey(subject: Subject): string {
  switch (subject.kind) {
    case 'site':
      return 'site';
    case 'routeGroup':
      return `route:${subject.route}`;
    case 'file':
      return `file:${subject.path}`;
  }
}
