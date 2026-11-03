import { createInterface } from 'node:readline/promises';
import { colorEnabled, palette, type Palette } from '../core/tty.ts';

// Only the CLI layer touches stdout, prompts and the process exit (spec 4).

export interface Io {
  out(text: string): void;
  err(text: string): void;
  readonly interactive: boolean;
  readonly color: Palette;
  readonly errColor: Palette;
  confirm(question: string): Promise<boolean>;
  ask(question: string): Promise<string>;
  readonly env: NodeJS.ProcessEnv;
}

export function isCi(env: NodeJS.ProcessEnv): boolean {
  return env.CI !== undefined && env.CI !== '' && env.CI !== '0' && env.CI !== 'false';
}

export function processIo(opts: { nonInteractive: boolean; noColor: boolean }, env: NodeJS.ProcessEnv = process.env): Io {
  const interactive = !opts.nonInteractive && !isCi(env) && Boolean(process.stdin.isTTY && process.stdout.isTTY);
  const ask = async (question: string): Promise<string> => {
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    try {
      return (await rl.question(question)).trim();
    } finally {
      rl.close();
    }
  };
  return {
    out: (t) => process.stdout.write(t),
    err: (t) => process.stderr.write(t),
    interactive,
    color: palette(!opts.noColor && colorEnabled(env, Boolean(process.stdout.isTTY)), env),
    errColor: palette(!opts.noColor && colorEnabled(env, Boolean(process.stderr.isTTY)), env),
    confirm: async (q) => interactive && /^y(es)?$/i.test(await ask(`${q} [y/N] `)),
    ask: async (q) => (interactive ? ask(q) : ''),
    env,
  };
}
