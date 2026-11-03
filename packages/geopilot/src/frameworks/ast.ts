import { parse, type ParserPlugin } from '@babel/parser';
import type * as t from '@babel/types';

// Source is parsed, never evaluated. A value is "static" only when every node
// on its path is a literal; anything else is reported as dynamic with the node
// that made it so, which is what provenance downgrades on.

export type StaticValue =
  | { readonly kind: 'string'; readonly value: string; readonly node: t.Node }
  | { readonly kind: 'number'; readonly value: number; readonly node: t.Node }
  | { readonly kind: 'boolean'; readonly value: boolean; readonly node: t.Node }
  | { readonly kind: 'null'; readonly node: t.Node }
  | { readonly kind: 'object'; readonly props: ReadonlyMap<string, StaticProp>; readonly dynamicKeys: boolean; readonly node: t.ObjectExpression }
  | { readonly kind: 'array'; readonly items: readonly StaticValue[]; readonly node: t.Node }
  | { readonly kind: 'dynamic'; readonly reason: string; readonly node: t.Node };

export interface StaticProp {
  readonly key: string;
  readonly value: StaticValue;
  readonly node: t.ObjectProperty | t.ObjectMethod;
}

export interface ParsedModule {
  readonly file: string;
  readonly source: string;
  readonly ast: t.File;
}

export function parseModule(file: string, source: string): ParsedModule | { error: string } {
  const plugins: ParserPlugin[] = ['jsx'];
  if (/\.(ts|tsx|mts|cts)$/.test(file)) plugins.push('typescript');
  try {
    const ast = parse(source, { sourceType: 'module', plugins, errorRecovery: false }) as unknown as t.File;
    return { file, source, ast };
  } catch (e) {
    return { error: (e as Error).message };
  }
}

/** Strip TS wrappers that do not change the runtime value: `x as T`, `x satisfies T`, `x!`, `(x)`. */
export function unwrap(node: t.Node): t.Node {
  let n = node;
  for (;;) {
    if (n.type === 'TSAsExpression' || n.type === 'TSSatisfiesExpression' || n.type === 'TSNonNullExpression' || n.type === 'TSTypeAssertion') {
      n = n.expression;
    } else if (n.type === 'ParenthesizedExpression') {
      n = n.expression;
    } else {
      return n;
    }
  }
}

function keyName(prop: t.ObjectProperty | t.ObjectMethod): string | null {
  if (prop.computed) return prop.key.type === 'StringLiteral' ? prop.key.value : null;
  if (prop.key.type === 'Identifier') return prop.key.name;
  if (prop.key.type === 'StringLiteral') return prop.key.value;
  if (prop.key.type === 'NumericLiteral') return String(prop.key.value);
  return null;
}

export function staticValue(input: t.Node): StaticValue {
  const node = unwrap(input);
  switch (node.type) {
    case 'StringLiteral':
      return { kind: 'string', value: node.value, node };
    case 'TemplateLiteral':
      if (node.expressions.length === 0) return { kind: 'string', value: node.quasis.map((q) => q.value.cooked ?? q.value.raw).join(''), node };
      return { kind: 'dynamic', reason: 'template literal with expressions', node };
    case 'NumericLiteral':
      return { kind: 'number', value: node.value, node };
    case 'BooleanLiteral':
      return { kind: 'boolean', value: node.value, node };
    case 'NullLiteral':
      return { kind: 'null', node };
    case 'ArrayExpression': {
      const items: StaticValue[] = [];
      for (const el of node.elements) {
        if (!el || el.type === 'SpreadElement') return { kind: 'dynamic', reason: 'array spread or hole', node };
        items.push(staticValue(el));
      }
      return { kind: 'array', items, node };
    }
    case 'ObjectExpression': {
      const props = new Map<string, StaticProp>();
      let dynamicKeys = false;
      for (const p of node.properties) {
        if (p.type === 'SpreadElement') {
          dynamicKeys = true;
          continue;
        }
        const key = keyName(p);
        if (key === null) {
          dynamicKeys = true;
          continue;
        }
        const value: StaticValue = p.type === 'ObjectMethod' ? { kind: 'dynamic', reason: 'method', node: p } : staticValue(p.value);
        props.set(key, { key, value, node: p });
      }
      return { kind: 'object', props, dynamicKeys, node };
    }
    case 'NewExpression': {
      // `new URL('https://…')` is how metadataBase is written; with one literal
      // argument its value is that literal.
      const arg = node.arguments[0];
      if (node.callee.type === 'Identifier' && node.callee.name === 'URL' && node.arguments.length === 1 && arg && arg.type !== 'SpreadElement' && arg.type !== 'ArgumentPlaceholder') {
        const inner = staticValue(arg);
        if (inner.kind === 'string') return { kind: 'string', value: inner.value, node };
      }
      return { kind: 'dynamic', reason: 'constructor call', node };
    }
    case 'Identifier':
      if (node.name === 'undefined') return { kind: 'null', node };
      return { kind: 'dynamic', reason: `identifier ${node.name}`, node };
    default:
      return { kind: 'dynamic', reason: node.type, node };
  }
}

export interface ExportInfo {
  readonly name: string;
  readonly kind: 'const' | 'function' | 'reexport';
  readonly init: t.Node | null;
  readonly node: t.Node;
  readonly from?: string;
}

/** Top-level named exports: `export const x = …`, `export function x`, `export { x } from`, `export { x }`. */
export function exportsOf(mod: ParsedModule): Map<string, ExportInfo> {
  const out = new Map<string, ExportInfo>();
  const locals = new Map<string, { init: t.Node | null; node: t.Node; kind: 'const' | 'function' }>();
  for (const stmt of mod.ast.program.body) {
    const decl = stmt.type === 'ExportNamedDeclaration' ? stmt.declaration : stmt;
    if (decl && decl.type === 'VariableDeclaration') {
      for (const d of decl.declarations) {
        if (d.id.type === 'Identifier') locals.set(d.id.name, { init: d.init ?? null, node: d, kind: 'const' });
      }
    } else if (decl && decl.type === 'FunctionDeclaration' && decl.id) {
      locals.set(decl.id.name, { init: decl, node: decl, kind: 'function' });
    }
  }
  for (const stmt of mod.ast.program.body) {
    if (stmt.type !== 'ExportNamedDeclaration') continue;
    if (stmt.declaration) {
      const decl = stmt.declaration;
      if (decl.type === 'VariableDeclaration') {
        for (const d of decl.declarations) {
          if (d.id.type === 'Identifier') out.set(d.id.name, { name: d.id.name, kind: 'const', init: d.init ?? null, node: d });
        }
      } else if (decl.type === 'FunctionDeclaration' && decl.id) {
        out.set(decl.id.name, { name: decl.id.name, kind: 'function', init: decl, node: decl });
      }
      continue;
    }
    for (const spec of stmt.specifiers) {
      if (spec.type !== 'ExportSpecifier') continue;
      const exported = spec.exported.type === 'Identifier' ? spec.exported.name : spec.exported.value;
      if (stmt.source) {
        out.set(exported, { name: exported, kind: 'reexport', init: null, node: spec, from: stmt.source.value });
      } else {
        const local = locals.get(spec.local.type === 'Identifier' ? spec.local.name : (spec.local as t.StringLiteral).value);
        if (local) out.set(exported, { name: exported, kind: local.kind, init: local.init, node: local.node });
      }
    }
  }
  return out;
}

/** Map of local binding name → import source, for following in-repo imports. */
export function importsOf(mod: ParsedModule): Map<string, { from: string; imported: string }> {
  const out = new Map<string, { from: string; imported: string }>();
  for (const stmt of mod.ast.program.body) {
    if (stmt.type !== 'ImportDeclaration') continue;
    for (const spec of stmt.specifiers) {
      if (spec.type === 'ImportSpecifier') {
        out.set(spec.local.name, { from: stmt.source.value, imported: spec.imported.type === 'Identifier' ? spec.imported.name : (spec.imported as t.StringLiteral).value });
      } else if (spec.type === 'ImportDefaultSpecifier') {
        out.set(spec.local.name, { from: stmt.source.value, imported: 'default' });
      }
    }
  }
  return out;
}

export function hasDirective(mod: ParsedModule, directive: string): boolean {
  return mod.ast.program.directives.some((d) => d.value.value === directive);
}

export function lineCol(node: t.Node): { line: number; column: number } {
  return { line: node.loc?.start.line ?? 1, column: (node.loc?.start.column ?? 0) + 1 };
}

/** Depth-first walk over every AST node. */
export function walk(node: t.Node, visit: (n: t.Node) => void): void {
  visit(node);
  for (const key of Object.keys(node) as (keyof t.Node)[]) {
    if (key === 'loc' || key === 'leadingComments' || key === 'trailingComments' || key === 'innerComments') continue;
    const value = node[key] as unknown;
    if (Array.isArray(value)) {
      for (const v of value) if (v && typeof v === 'object' && typeof (v as t.Node).type === 'string') walk(v as t.Node, visit);
    } else if (value && typeof value === 'object' && typeof (value as t.Node).type === 'string') {
      walk(value as t.Node, visit);
    }
  }
}

export interface JsxHtml {
  readonly node: t.JSXOpeningElement;
  readonly lang: { readonly kind: 'literal'; readonly value: string; readonly node: t.Node } | { readonly kind: 'expression'; readonly node: t.Node } | null;
  readonly hasSpread: boolean;
  readonly count: number;
}

/** The `<html>` JSX opening element(s) in a module, as root layouts render them. */
export function findJsxHtml(mod: ParsedModule): JsxHtml | null {
  const found: t.JSXOpeningElement[] = [];
  walk(mod.ast, (n) => {
    if (n.type === 'JSXOpeningElement' && n.name.type === 'JSXIdentifier' && n.name.name === 'html') found.push(n);
  });
  const first = found[0];
  if (!first) return null;
  let lang: JsxHtml['lang'] = null;
  let hasSpread = false;
  for (const attr of first.attributes) {
    if (attr.type === 'JSXSpreadAttribute') {
      hasSpread = true;
      continue;
    }
    if (attr.name.type === 'JSXIdentifier' && attr.name.name === 'lang') {
      if (attr.value?.type === 'StringLiteral') lang = { kind: 'literal', value: attr.value.value, node: attr };
      else if (attr.value?.type === 'JSXExpressionContainer') {
        const sv = attr.value.expression.type === 'JSXEmptyExpression' ? null : staticValue(attr.value.expression);
        lang = sv && sv.kind === 'string' ? { kind: 'literal', value: sv.value, node: attr } : { kind: 'expression', node: attr };
      } else lang = { kind: 'expression', node: attr };
    }
  }
  return { node: first, lang, hasSpread, count: found.length };
}

/** Whether a source text contains an ObjectProperty key with one of these names, by AST. */
export function hasObjectKey(mod: ParsedModule, names: ReadonlySet<string>): string[] {
  const hits = new Set<string>();
  walk(mod.ast, (n) => {
    if ((n.type === 'ObjectProperty' || n.type === 'ObjectMethod') && !n.computed) {
      const k = n.key.type === 'Identifier' ? n.key.name : n.key.type === 'StringLiteral' ? n.key.value : null;
      if (k && names.has(k)) hits.add(k);
    }
  });
  return [...hits].sort();
}
