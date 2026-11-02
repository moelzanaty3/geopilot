// Exit codes are a contract (spec 5.1). Scripts and CI branch on them, so each
// kind maps to exactly one number and nothing else in the tree picks a number.
export const EXIT = {
  ok: 0,
  gate: 1,
  usage: 2,
  config: 3,
  incomplete: 4,
  rolledBack: 5,
  unverified: 6,
  internal: 70,
} as const;

export type ExitKind = keyof typeof EXIT;
export type ExitCode = (typeof EXIT)[ExitKind];

export class GeoError extends Error {
  readonly kind: ExitKind;
  readonly hint: string | undefined;

  constructor(kind: ExitKind, message: string, hint?: string) {
    super(message);
    this.name = 'GeoError';
    this.kind = kind;
    this.hint = hint;
  }

  get exitCode(): ExitCode {
    return EXIT[this.kind];
  }
}

export function isGeoError(e: unknown): e is GeoError {
  return e instanceof GeoError;
}

export function usage(message: string, hint?: string): GeoError {
  return new GeoError('usage', message, hint);
}
