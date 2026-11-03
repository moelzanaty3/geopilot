import { canonicalJson } from '../core/hash.ts';
import type { Palette } from '../core/tty.ts';
import { ruleMeta } from '../rules/catalogue.ts';
import { displayPercent, displayReadiness } from '../scoring/score.ts';
import { subjectKey, type Evaluation, type Finding, type Report, type Severity } from '../types.ts';

export type Format = 'pretty' | 'json' | 'markdown';
export const FORMATS: readonly Format[] = ['pretty', 'json', 'markdown'];

const SEVERITY_ORDER: Record<Severity, number> = { high: 0, medium: 1, low: 2, info: 3 };

export function sortedFindings(report: Report): { finding: Finding; evaluation: Evaluation }[] {
  return report.evaluations
    .flatMap((evaluation) => evaluation.findings.map((finding) => ({ finding, evaluation })))
    .sort((a, b) => SEVERITY_ORDER[a.finding.severity] - SEVERITY_ORDER[b.finding.severity] || (a.finding.ruleId < b.finding.ruleId ? -1 : a.finding.ruleId > b.finding.ruleId ? 1 : a.finding.fingerprint < b.finding.fingerprint ? -1 : 1));
}

function subjectLabel(e: Evaluation): string {
  return e.subject.kind === 'site' ? 'site' : e.subject.kind === 'routeGroup' ? e.subject.route : e.subject.path;
}

function statusLabel(e: Evaluation): string {
  switch (e.status) {
    case 'pass':
      return 'pass';
    case 'fail':
      return 'fail';
    case 'not_applicable':
      return `n/a (${e.statusReason ?? ''})`;
    case 'not_evaluated':
      return `not evaluated (${(e.statusReason ?? '').replace(/_/g, ' ')})`;
    case 'error':
      return `error (${e.statusReason ?? ''})`;
  }
}

function location(f: Finding): string {
  const loc = f.provenance.locations[0];
  if (!loc) return `provenance ${f.provenance.level}`;
  return `${loc.file}${loc.line ? `:${loc.line}` : ''}  provenance ${f.provenance.level}`;
}

interface RuleRow {
  readonly id: string;
  readonly title: string;
  readonly summary: string;
}

export function ruleRows(report: Report): RuleRow[] {
  const by = new Map<string, Evaluation[]>();
  for (const e of report.evaluations) by.set(e.ruleId, [...(by.get(e.ruleId) ?? []), e]);
  return [...by.entries()].map(([id, evals]) => {
    const meta = ruleMeta(evals[0]!.ruleId);
    const counts = new Map<string, number>();
    for (const e of evals) {
      const k = e.evidenceQuality === 'inferred' && (e.status === 'pass' || e.status === 'fail') ? `inferred ${e.status}` : statusLabel(e);
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    const summary = [...counts.entries()].map(([k, n]) => (evals.length === 1 ? k : `${n} ${k}`)).join(', ');
    return { id, title: meta.title, summary };
  });
}

function tierLine(r: Report): string {
  const f = r.framework;
  if (!r.run.mode.includes('repo') && r.run.mode !== 'mixed') return 'URL audit (T0)';
  const t = f.capabilityTier;
  const parts = [`URL ${t.urlAudit ?? '—'}`, `repo ${t.repo ?? '—'}`, `provenance ${t.provenance ?? 'none'}`, `fixes ${t.fixes ?? 'none'}`];
  return `${f.id} (${f.state}) · ${parts.join(' · ')}`;
}

export function renderPretty(r: Report, p: Palette): string {
  const out: string[] = [];
  out.push(`${p.brand(p.bold('geopilot'))} ${p.dim(r.tool.version)}  ${p.dim('·')}  ${r.run.targets.join(', ')}  ${p.dim('·')}  ${p.dim(r.run.id)}`);
  out.push(p.dim(`  ${tierLine(r)}`));
  out.push('');
  const readiness = displayReadiness(r.readiness);
  out.push(`  ${p.dim('Readiness ')}  ${r.readiness.display === 'insufficient_evidence' ? p.yellow(readiness) : p.bold(readiness)}${r.readiness.capReason ? p.red(`  capped: ${r.readiness.capReason}`) : ''}`);
  out.push(`  ${p.dim('Coverage  ')}  ${displayPercent(r.coverage)}    ${p.dim('Confidence')}  ${displayPercent(r.confidence)}    ${p.dim('Assessment')}  ${r.assessmentScope.assessment}`);
  for (const n of r.assessmentScope.notes) out.push(`  ${p.dim('·')} ${n}`);
  out.push('');
  const findings = sortedFindings(r);
  if (findings.length === 0) out.push(`  ${p.green('No findings')} ${p.dim('on the subjects that were evaluated.')}`);
  for (const { finding: f, evaluation: e } of findings) {
    const tag = f.severity === 'high' ? p.red('HIGH') : f.severity === 'medium' ? p.yellow('MED ') : p.dim('LOW ');
    const inferred = f.evidenceQuality === 'inferred' ? p.dim(' (inferred, unscored)') : '';
    out.push(`  ${tag}  ${p.bold(f.ruleId)}  ${p.brand(subjectLabel(e))}  ${f.message}${inferred}`);
    out.push(`        ${p.dim(location(f))}`);
    if (f.fixes.length > 0) out.push(`        ${p.dim('fix')} ${f.fixes.map((x) => `${x.fixId} (${x.class})`).join(', ')}  ${p.dim(`→ geopilot fix --rule ${f.ruleId}`)}`);
  }
  if (r.informational.length > 0) {
    out.push('');
    out.push(`  ${p.dim('Informational (never scored)')}`);
    for (const i of r.informational) out.push(`  ${p.dim('·')} ${p.dim(i.ruleId)} ${i.message}`);
  }
  if (r.suppressed.length > 0) out.push(`\n  ${p.dim(`${r.suppressed.length} finding(s) suppressed by geo.config.json`)}`);
  out.push('');
  out.push(`  ${p.dim('Rules')}`);
  for (const row of ruleRows(r)) out.push(`  ${p.dim(row.id)}  ${row.title.padEnd(72).slice(0, 72)}  ${row.summary}`);
  if (r.notices.length > 0) {
    out.push('');
    for (const n of r.notices) out.push(`  ${p.yellow('note')}  ${n}`);
  }
  out.push('');
  out.push(p.dim(`  ${r.disclaimer}`));
  return `${out.join('\n')}\n`;
}

const md = (s: string): string => s.replace(/\|/g, '\\|');

export function renderMarkdown(r: Report): string {
  const out: string[] = [];
  out.push(`# geopilot report`);
  out.push('');
  out.push(`> ${r.disclaimer}`);
  out.push('');
  out.push(`- **Targets:** ${r.run.targets.map((t) => `\`${t}\``).join(', ')}`);
  out.push(`- **Run:** \`${r.run.id}\` · ${r.run.mode} · geopilot ${r.tool.version} · ruleset ${r.tool.rulesetVersion} · scoring ${r.tool.scoringVersion}`);
  out.push(`- **Capability:** ${tierLine(r)}`);
  out.push('');
  out.push('| Readiness | Coverage | Confidence | Assessment |');
  out.push('| --- | --- | --- | --- |');
  out.push(`| ${displayReadiness(r.readiness)}${r.readiness.capReason ? ` (capped: ${md(r.readiness.capReason)})` : ''} | ${displayPercent(r.coverage)} | ${displayPercent(r.confidence)} | ${r.assessmentScope.assessment} |`);
  out.push('');
  for (const n of r.assessmentScope.notes) out.push(`- ${n}`);
  out.push('');
  out.push('## Verified engine findings');
  out.push('');
  const findings = sortedFindings(r).filter((x) => x.finding.evidenceQuality !== 'inferred');
  if (findings.length === 0) out.push('None on the subjects that were evaluated.');
  else {
    out.push('| Severity | Rule | Subject | Finding | Source | Fix |');
    out.push('| --- | --- | --- | --- | --- | --- |');
    for (const { finding: f, evaluation: e } of findings) {
      out.push(`| ${f.severity} | [${f.ruleId}](${f.docs}) | \`${md(subjectLabel(e))}\` | ${md(f.message)} | ${md(location(f))} | ${f.fixes.map((x) => `\`${x.fixId}\` (${x.class})`).join(', ') || '—'} |`);
    }
  }
  const inferred = sortedFindings(r).filter((x) => x.finding.evidenceQuality === 'inferred');
  if (inferred.length > 0) {
    out.push('');
    out.push('## Inferred observations (unscored)');
    out.push('');
    for (const { finding: f, evaluation: e } of inferred) out.push(`- **${f.ruleId}** \`${subjectLabel(e)}\`: ${f.message}`);
  }
  if (r.informational.length > 0) {
    out.push('');
    out.push('## Informational (never scored)');
    out.push('');
    for (const i of r.informational) out.push(`- **${i.ruleId}** ${i.message}`);
  }
  out.push('');
  out.push('## Rules');
  out.push('');
  out.push('| Rule | Title | Result |');
  out.push('| --- | --- | --- |');
  for (const row of ruleRows(r)) out.push(`| ${row.id} | ${md(row.title)} | ${md(row.summary)} |`);
  if (r.notices.length > 0) {
    out.push('');
    out.push('## Notices');
    out.push('');
    for (const n of r.notices) out.push(`- ${n}`);
  }
  out.push('');
  return `${out.join('\n')}`;
}

export function renderJson(r: Report): string {
  return canonicalJson(r);
}

export function render(r: Report, format: Format, p: Palette): string {
  if (format === 'json') return renderJson(r);
  if (format === 'markdown') return renderMarkdown(r);
  return renderPretty(r, p);
}

export function evaluationKey(e: Evaluation): string {
  return `${e.ruleId} ${subjectKey(e.subject)}`;
}
