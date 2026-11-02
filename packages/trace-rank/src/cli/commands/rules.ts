import { EXIT, usage } from '../../core/errors.ts';
import { canonicalJson } from '../../core/hash.ts';
import { findRule, RETIRED, RULES, ruleDocsUrl, type RuleMeta } from '../../rules/catalogue.ts';
import { VARIANTS } from '../../fix/plan.ts';
import { GLOBAL_FLAGS, parseArgs, RULES_FLAGS } from '../args.ts';
import type { Deps } from '../context.ts';

export function explainText(meta: RuleMeta, p: Deps['io']['color']): string {
  const lines: string[] = [];
  lines.push(`${p.brand(p.bold(meta.id))}  ${p.bold(meta.title)}`);
  lines.push('');
  lines.push(meta.purpose);
  lines.push('');
  lines.push(`${p.dim('Evidence class')}  ${meta.evidenceClass}${meta.scored ? `   ${p.dim('weight')} ${meta.weight}` : `   ${p.dim('unscored')}`}   ${p.dim('scope')} ${meta.scope}   ${p.dim('subject')} ${meta.subject === 'site' ? 'site' : 'route group'}`);
  lines.push(`${p.dim('Default severity')} ${meta.severity}   ${p.dim('lifecycle')} ${meta.lifecycle}`);
  if (meta.subChecks.length > 0) {
    lines.push('');
    lines.push(p.dim('Sub-checks (a rule never passes on a partial set of these)'));
    for (const s of meta.subChecks) lines.push(`  ${s.id.padEnd(20)} ${p.dim(`[${s.scope}]`.padEnd(7))} ${s.description}`);
  }
  if (meta.preconditions.length > 0) {
    lines.push('');
    lines.push(p.dim('Preconditions'));
    for (const x of meta.preconditions) lines.push(`  · ${x}`);
  }
  lines.push('');
  lines.push(`${p.dim('Fix class')}  ${meta.fixClass}`);
  for (const v of meta.fixVariants) {
    const spec = VARIANTS[v as keyof typeof VARIANTS];
    lines.push(spec ? `  ${v}  ${spec.title} (${spec.class}, requires ${spec.required})` : `  ${v}  Phase 2`);
  }
  lines.push('');
  lines.push(`${p.dim('Remediation')}  ${meta.remediation}`);
  if (meta.falsePositives.length > 0) {
    lines.push('');
    lines.push(p.dim('Known false positives'));
    for (const x of meta.falsePositives) lines.push(`  · ${x}`);
  }
  if (meta.blockerCap) lines.push(`\n${p.dim('Readiness cap')}  capped at 40 when direct evidence shows: ${meta.blockerCap}`);
  lines.push('');
  lines.push(p.dim('References'));
  for (const r of meta.references) lines.push(`  · ${r.title} (${r.kind}) ${p.dim(r.url)}`);
  lines.push('');
  lines.push(`${p.dim('Docs')}  ${ruleDocsUrl(meta.id)}`);
  return `${lines.join('\n')}\n`;
}

export async function explainCommand(argv: readonly string[], deps: Deps): Promise<number> {
  const p = parseArgs(argv, GLOBAL_FLAGS);
  const id = p.positionals[0];
  if (!id) throw usage('explain needs a rule id, e.g. trace-rank explain GEO-012');
  const meta = findRule(id);
  if (!meta) {
    const retired = RETIRED.find((r) => r.id === id.toUpperCase());
    if (retired) {
      deps.io.out(`${retired.id} (${retired.title}) is retired. GEO does not score content-format mandates; an agent may still raise grounded content insights.\n`);
      return EXIT.ok;
    }
    throw usage(`unknown rule ${id}`, 'Run trace-rank rules for the catalogue.');
  }
  if ((p.multi.get('format') ?? []).includes('json')) deps.io.out(canonicalJson(meta));
  else deps.io.out(explainText(meta, deps.io.color));
  return EXIT.ok;
}

export async function rulesCommand(argv: readonly string[], deps: Deps): Promise<number> {
  const p = parseArgs(argv, [...GLOBAL_FLAGS, ...RULES_FLAGS]);
  const list = p.bool.has('all') ? RULES : RULES.filter((r) => r.lifecycle !== 'informational');
  if (p.bool.has('json') || (p.multi.get('format') ?? []).includes('json')) {
    deps.io.out(canonicalJson({ rules: list, retired: p.bool.has('all') ? RETIRED : [] }));
    return EXIT.ok;
  }
  const c = deps.io.color;
  for (const r of list) {
    deps.io.out(`${c.brand(r.id)}  ${r.evidenceClass}  ${r.scored ? `w${r.weight}` : '  '}  ${r.title}  ${c.dim(r.scope)}\n`);
  }
  if (p.bool.has('all')) for (const r of RETIRED) deps.io.out(`${c.dim(`${r.id}  retired  ${r.title}`)}\n`);
  return EXIT.ok;
}
