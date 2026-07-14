import { spawn } from 'node:child_process';
import { UserAbortError } from '../domain/errors.js';

export interface ProcessRequest {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  env?: Record<string, string>;
  stdin?: string;
  signal?: AbortSignal;
  /** Cap captured output to avoid unbounded memory usage. */
  maxOutputBytes?: number;
}

export interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  aborted: boolean;
}

const DEFAULT_MAX_OUTPUT = 5 * 1024 * 1024;
const KILL_GRACE_MS = 3_000;

/**
 * Runs a child process WITHOUT a shell, with timeout, output capping and
 * cooperative cancellation. SIGTERM first, SIGKILL after a grace period.
 */
export function runProcess(request: ProcessRequest): Promise<ProcessResult> {
  const maxOutput = request.maxOutputBytes ?? DEFAULT_MAX_OUTPUT;
  const started = Date.now();

  return new Promise<ProcessResult>((resolve, reject) => {
    if (request.signal?.aborted) {
      reject(new UserAbortError());
      return;
    }

    const child = spawn(request.command, request.args, {
      cwd: request.cwd,
      shell: false,
      env: { ...process.env, ...request.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let aborted = false;
    let settled = false;
    let killTimer: NodeJS.Timeout | undefined;

    const timeout = setTimeout(() => {
      timedOut = true;
      terminate();
    }, request.timeoutMs);

    const onAbort = () => {
      aborted = true;
      terminate();
    };
    request.signal?.addEventListener('abort', onAbort, { once: true });

    function terminate(): void {
      child.kill('SIGTERM');
      killTimer = setTimeout(() => {
        child.kill('SIGKILL');
      }, KILL_GRACE_MS);
    }

    function cleanup(): void {
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      request.signal?.removeEventListener('abort', onAbort);
    }

    child.stdout.on('data', (chunk: Buffer) => {
      if (stdout.length < maxOutput) stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.length < maxOutput) stderr += chunk.toString('utf8');
    });

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      // Command not found / not executable: surface as exit code 127 like a shell would.
      resolve({
        exitCode: 127,
        stdout,
        stderr: `${stderr}\n${error.message}`.trim(),
        durationMs: Date.now() - started,
        timedOut,
        aborted,
      });
    });

    child.on('close', (code) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (aborted) {
        reject(new UserAbortError());
        return;
      }
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
        durationMs: Date.now() - started,
        timedOut,
        aborted,
      });
    });

    if (request.stdin !== undefined) {
      child.stdin.write(request.stdin);
    }
    child.stdin.end();
  });
}
