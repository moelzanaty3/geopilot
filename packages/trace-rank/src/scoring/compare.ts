import type { Report, Status } from '../types.ts';
import { subjectKey } from '../types.ts';

// Spec 10.3. A numeric delta exists only when the scoring version, the ruleset
// major.minor and the direct scope are identical. Otherwise the comparison
// reports what entered and left the scope.

export type Comparison =
  | { readonly comparable: true; readonly delta: number | null; readonly resolved: readonly string[]; readonly introduced: readonly string[] }
  | {
      readonly comparable: false;
      readonly reason: string;
      readonly entering: readonly { readonly key: string; readonly status: Status }[];
      readonly leaving: readonly { readonly key: string; readonly status: Status }[];
      readonly resolved: readonly string[];
      readonly introduced: readonly string[];
    };

const majorMinor = (v: string): string => v.split('.').slice(0, 2).join('.');

function directKeys(r: Report): Map<string, Status> {
  const m = new Map<string, Status>();
  for (const d of r.assessmentScope.direct) {
    const e = r.evaluations.find((x) => x.ruleId === d.ruleId && subjectKey(x.subject) === d.subject);
    m.set(`${d.ruleId} ${d.subject}`, e?.status ?? 'pass');
  }
  return m;
}

/** `fail → not_evaluated/error` is never a resolution; only `fail → pass` is. */
function resolution(before: Report, after: Report): { resolved: string[]; introduced: string[] } {
  const statusAfter = new Map(after.evaluations.map((e) => [`${e.ruleId} ${subjectKey(e.subject)}`, e.status]));
  const beforeFps = new Set(before.evaluations.flatMap((e) => e.findings.map((f) => f.fingerprint)));
  const afterFps = new Set(after.evaluations.flatMap((e) => e.findings.map((f) => f.fingerprint)));
  const resolved: string[] = [];
  for (const e of before.evaluations) {
    if (e.status !== 'fail') continue;
    const key = `${e.ruleId} ${subjectKey(e.subject)}`;
    if (statusAfter.get(key) === 'pass') resolved.push(key);
  }
  const introduced = [...afterFps].filter((f) => !beforeFps.has(f)).sort();
  return { resolved: resolved.sort(), introduced };
}

export function compareReports(before: Report, after: Report): Comparison {
  const { resolved, introduced } = resolution(before, after);
  const a = directKeys(before);
  const b = directKeys(after);
  const sameScope = a.size === b.size && [...a.keys()].every((k) => b.has(k));
  const reason =
    before.tool.scoringVersion !== after.tool.scoringVersion
      ? 'scoring version changed'
      : majorMinor(before.tool.rulesetVersion) !== majorMinor(after.tool.rulesetVersion)
        ? 'ruleset version changed'
        : !sameScope
          ? 'assessment scope changed'
          : null;
  if (reason === null) {
    const delta = before.readiness.value !== null && after.readiness.value !== null ? after.readiness.value - before.readiness.value : null;
    return { comparable: true, delta, resolved, introduced };
  }
  const entering = [...b].filter(([k]) => !a.has(k)).map(([key, status]) => ({ key, status }));
  const leaving = [...a].filter(([k]) => !b.has(k)).map(([key]) => ({ key, status: after.evaluations.find((e) => `${e.ruleId} ${subjectKey(e.subject)}` === key)?.status ?? ('not_evaluated' as Status) }));
  return { comparable: false, reason, entering, leaving, resolved, introduced };
}
