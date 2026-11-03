// Evidence leaves the machine in reports and PR comments, so anything that
// looks like a credential is masked before it is stored, and snippets are
// capped at 300 characters (spec 14).
const PATTERNS: readonly RegExp[] = [
  /\b(?:ghp|gho|ghu|ghs|ghr|github_pat)_[A-Za-z0-9_]{20,}\b/g,
  /\bsk-[A-Za-z0-9_-]{20,}\b/g,
  /\bAKIA[0-9A-Z]{16}\b/g,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
  /(?<=(?:api[_-]?key|token|secret|password|passwd|authorization)["'\s:=]+)[^\s"'&]{8,}/gi,
];

export const SNIPPET_LIMIT = 300;

export function redact(text: string): string {
  let out = text;
  for (const pattern of PATTERNS) out = out.replace(pattern, '[redacted]');
  return out;
}

export function snippet(text: string, limit = SNIPPET_LIMIT): string {
  const clean = redact(text.replace(/\s+/g, ' ').trim());
  return clean.length > limit ? `${clean.slice(0, limit - 1)}…` : clean;
}
