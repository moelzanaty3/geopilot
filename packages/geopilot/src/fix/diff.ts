// Fixes are local splices, so a single hunk around the changed span is the
// whole diff: trim the common prefix and suffix, then show three lines of
// context either side.

export function unifiedDiff(path: string, before: string | null, after: string, context = 3): string {
  const a = before === null ? [] : before.split('\n');
  const b = after.split('\n');
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA--;
    endB--;
  }
  if (start === endA && start === endB) return '';
  const from = Math.max(0, start - context);
  const toA = Math.min(a.length, endA + context);
  const toB = Math.min(b.length, endB + context);
  const lines: string[] = [];
  lines.push(`--- ${before === null ? '/dev/null' : `a/${path}`}`);
  lines.push(`+++ b/${path}`);
  lines.push(`@@ -${before === null ? 0 : from + 1},${toA - from} +${from + 1},${toB - from} @@`);
  for (let i = from; i < start; i++) lines.push(` ${a[i]}`);
  for (let i = start; i < endA; i++) lines.push(`-${a[i]}`);
  for (let i = start; i < endB; i++) lines.push(`+${b[i]}`);
  for (let i = endA; i < toA; i++) lines.push(` ${a[i]}`);
  return `${lines.join('\n')}\n`;
}
