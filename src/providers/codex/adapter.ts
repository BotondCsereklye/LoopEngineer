import { PROBE_TIMEOUT_MS } from '../../config/defaults.js';
import { runProcess } from '../../execution/process-runner.js';
import type {
  AgentProvider,
  AgentRequest,
  AgentResponse,
  ProviderAvailability,
} from '../provider.js';
import { parseCodexOutput } from './parser.js';

/**
 * Adapter for the official Codex CLI (`codex`).
 *
 * Loop Engineer only ever invokes the locally installed, already-authenticated
 * CLI and maps permission modes onto Codex's own sandbox flags. Credentials
 * are never read, stored or forwarded.
 */
export class CodexProvider implements AgentProvider {
  readonly id = 'codex';

  constructor(private readonly binary = 'codex') {}

  async checkAvailability(): Promise<ProviderAvailability> {
    const version = await runProcess({
      command: this.binary,
      args: ['--version'],
      cwd: process.cwd(),
      timeoutMs: PROBE_TIMEOUT_MS,
    });
    if (version.exitCode !== 0) {
      return {
        installed: false,
        details: 'Codex CLI not found. Install it and run `codex login` to sign in.',
      };
    }

    // `codex login status` is an official, non-interactive status probe.
    const auth = await runProcess({
      command: this.binary,
      args: ['login', 'status'],
      cwd: process.cwd(),
      timeoutMs: PROBE_TIMEOUT_MS,
    });
    const combined = `${auth.stdout}\n${auth.stderr}`.toLowerCase();
    let authenticated: boolean | undefined;
    if (auth.exitCode === 0) {
      authenticated = true;
    } else if (combined.includes('not logged in') || combined.includes('not authenticated')) {
      authenticated = false;
    } else {
      authenticated = undefined;
    }

    return {
      installed: true,
      version: version.stdout.trim(),
      authenticated,
      details:
        authenticated === false
          ? 'Codex CLI is installed but not logged in. Run `codex login`.'
          : authenticated === true
            ? 'Codex CLI is installed and logged in.'
            : 'Codex CLI is installed; authentication status could not be verified.',
    };
  }

  async run(request: AgentRequest): Promise<AgentResponse> {
    // `-` reads the prompt from stdin; --json emits machine-readable events.
    const sandbox = request.permissionMode === 'workspace-write' ? 'workspace-write' : 'read-only';
    const args = [
      'exec',
      '--json',
      '--sandbox',
      sandbox,
      '--skip-git-repo-check',
      '--cd',
      request.cwd,
    ];
    if (request.model && request.model !== 'default') {
      args.push('--model', request.model);
    }
    args.push('-');

    const result = await runProcess({
      command: this.binary,
      args,
      cwd: request.cwd,
      timeoutMs: request.timeoutMs,
      stdin: request.prompt,
      signal: request.signal,
    });

    const parsed = parseCodexOutput(result.stdout);
    return {
      exitCode: result.exitCode,
      text: parsed.text,
      stderr: result.stderr,
      durationMs: result.durationMs,
      provider: this.id,
      model: request.model,
      sanitizedCommand: `${this.binary} ${args.join(' ')} (prompt via stdin, ${request.prompt.length} chars)`,
      timedOut: result.timedOut,
      error: result.timedOut
        ? 'Provider call timed out'
        : result.exitCode !== 0
          ? `Codex CLI exited with code ${result.exitCode}`
          : undefined,
    };
  }
}
