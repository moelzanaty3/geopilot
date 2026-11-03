// NO_COLOR is presence-based (no-color.org); FORCE_COLOR overrides both ways.
export function colorEnabled(env: NodeJS.ProcessEnv, isTty: boolean): boolean {
  if (env.NO_COLOR !== undefined) return false;
  if (env.FORCE_COLOR !== undefined) return env.FORCE_COLOR !== '0';
  if (env.TERM === 'dumb') return false;
  return isTty;
}

type Paint = (text: string) => string;

export interface Palette {
  brand: Paint;
  red: Paint;
  green: Paint;
  yellow: Paint;
  dim: Paint;
  bold: Paint;
}

const wrap =
  (open: string, close: string): Paint =>
  (text) =>
    `\x1b[${open}m${text}\x1b[${close}m`;
const plain: Paint = (text) => text;

// #1d9bf0 — the same value web/ calls --accent.
function brandOpen(env: NodeJS.ProcessEnv): string {
  if (/truecolor|24bit/i.test(env.COLORTERM ?? '')) return '38;2;29;155;240';
  if (/-256(color)?$/.test(env.TERM ?? '')) return '38;5;33';
  return '34';
}

export function palette(enabled: boolean, env: NodeJS.ProcessEnv = process.env): Palette {
  if (!enabled) return { brand: plain, red: plain, green: plain, yellow: plain, dim: plain, bold: plain };
  return {
    brand: wrap(brandOpen(env), '39'),
    red: wrap('31', '39'),
    green: wrap('32', '39'),
    yellow: wrap('33', '39'),
    dim: wrap('2', '22'),
    bold: wrap('1', '22'),
  };
}
