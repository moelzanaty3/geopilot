import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import { redact } from '../core/redact.ts';
import { guardedFetch } from '../net/fetch.ts';

// ADR-018: source freshness is "confirmed" only when GEO itself started the
// server after the last write. The command is an argv array, never a shell
// string; the URL is loopback; the port must be free first; the process tree
// is always terminated.

export type ServeUnavailable = 'port_in_use' | 'serve_not_ready' | 'spawn_failed' | 'not_configured' | 'not_authorised';

export interface ServeHandle {
  readonly origin: string;
  readonly startedAt: number;
  readonly logs: () => string;
  stop(): Promise<void>;
}

const LOG_LIMIT = 16 * 1024;

export function portOf(url: URL): number {
  if (url.port) return Number(url.port);
  return url.protocol === 'https:' ? 443 : 80;
}

export function portFree(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = createServer();
    srv.once('error', () => resolve(false));
    srv.once('listening', () => srv.close(() => resolve(true)));
    srv.listen({ host: host.replace(/^\[|\]$/g, ''), port, exclusive: true });
  });
}

function killTree(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null || child.pid === undefined) return resolve();
    const done = (): void => resolve();
    child.once('exit', done);
    if (process.platform === 'win32') {
      execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], () => undefined);
    } else {
      try {
        process.kill(-child.pid, 'SIGTERM');
      } catch {
        child.kill('SIGTERM');
      }
      setTimeout(() => {
        try {
          if (child.exitCode === null) process.kill(-child.pid!, 'SIGKILL');
        } catch {
          // already gone
        }
      }, 3000).unref();
    }
    setTimeout(done, 5000).unref();
  });
}

export async function startServe(
  command: readonly string[],
  url: string,
  cwd: string,
  readyTimeoutSeconds: number,
  lastWriteMs: number,
): Promise<ServeHandle | { unavailable: ServeUnavailable; detail: string }> {
  const target = new URL(url);
  const host = target.hostname === 'localhost' ? '127.0.0.1' : target.hostname;
  if (!(await portFree(host, portOf(target)))) {
    return { unavailable: 'port_in_use', detail: `something is already listening on ${target.host}; GEO cannot prove it would be talking to its own process` };
  }
  // Start strictly after the last write, at millisecond resolution.
  while (Date.now() <= lastWriteMs) await new Promise((r) => setTimeout(r, 2));
  let buffer = '';
  const startedAt = Date.now();
  let child: ChildProcess;
  try {
    child = spawn(command[0]!, command.slice(1), {
      cwd,
      shell: false,
      detached: process.platform !== 'win32',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, BROWSER: 'none', NEXT_TELEMETRY_DISABLED: '1' },
      windowsHide: true,
    });
  } catch (e) {
    return { unavailable: 'spawn_failed', detail: (e as Error).message };
  }
  const append = (chunk: Buffer): void => {
    if (buffer.length < LOG_LIMIT) buffer += chunk.toString('utf8').slice(0, LOG_LIMIT - buffer.length);
  };
  child.stdout?.on('data', append);
  child.stderr?.on('data', append);
  let spawnError: string | null = null;
  child.once('error', (e) => {
    spawnError = e.message;
  });
  const stop = (): Promise<void> => killTree(child);
  const onSignal = (): void => {
    void stop().then(() => process.exit(130));
  };
  process.once('SIGINT', onSignal);
  const handle: ServeHandle = {
    origin: target.origin,
    startedAt,
    logs: () => redact(buffer),
    stop: async () => {
      process.removeListener('SIGINT', onSignal);
      await stop();
    },
  };
  const deadline = Date.now() + readyTimeoutSeconds * 1000;
  const policy = { explicitHosts: new Set([target.hostname]) };
  while (Date.now() < deadline) {
    if (spawnError !== null || child.exitCode !== null) {
      await handle.stop();
      return { unavailable: 'spawn_failed', detail: spawnError ?? `serve command exited with ${child.exitCode}` };
    }
    const res = await guardedFetch(target.href, 'html', policy);
    if (res.status !== null) return handle;
    await new Promise((r) => setTimeout(r, 500));
  }
  await handle.stop();
  return { unavailable: 'serve_not_ready', detail: `no HTTP response from ${target.href} within ${readyTimeoutSeconds}s` };
}
