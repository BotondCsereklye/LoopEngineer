import { PROBE_TIMEOUT_MS } from '../../config/defaults.js';
import { runProcess } from '../../execution/process-runner.js';
import type {
  AgentProvider,
  AgentRequest,
  AgentResponse,
  ProviderAvailability,
} from '../provider.js';
import { parseClaudeOutput } from './parser.js';

const READ_ONLY_TOOLS = 'Read,Grep,Glob,LS';
const WRITE_TOOLS = 'Read,Grep,Glob,LS,Edit,Write,MultiEdit';

/**
 * Adapter for the official Claude Code CLI (`claude`).
 *
 * Loop Engineer only ever invokes the locally installed, already-authenticated
 * CLI. It never touches credentials, cookies or tokens — authentication stays
 * entirely inside the official tool.
 */
export class ClaudeProvider implements AgentProvider {
  readonly id = 'claude';

  constructor(private readonly binary = 'claude') {}

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
        details: 'Claude Code CLI not found. Install it and run `claude` once to sign in.',
      };
    }
    // There is no official non-interactive command guaranteed to report auth
    // state, so we do not guess (docs/providers.md).
    return {
      installed: true,
      version: version.stdout.trim(),
      authenticated: undefined,
      details:
        'Authentication status cannot be verified automatically; run `claude` once to confirm you are signed in.',
    };
  }

  async run(request: AgentRequest): Promise<AgentResponse> {
    const args = ['-p', '--output-format', 'json'];

    // Map Loop Engineer permission modes onto Claude Code tool allow-lists.
    // No Bash tool in either mode: shell access is never granted to LLM roles.
    if (request.permissionMode === 'workspace-write') {
      args.push('--permission-mode', 'acceptEdits', '--allowedTools', WRITE_TOOLS);
    } else {
      args.push('--allowedTools', READ_ONLY_TOOLS);
    }

    if (request.model && request.model !== 'default') {
      args.push('--model', request.model);
    }

    const result = await runProcess({
      command: this.binary,
      args,
      cwd: request.cwd,
      timeoutMs: request.timeoutMs,
      stdin: request.prompt,
      signal: request.signal,
    });

    const parsed = parseClaudeOutput(result.stdout);
    return {
      exitCode: result.exitCode,
      text: parsed.text,
      structured: parsed.structured,
      stderr: result.stderr,
      durationMs: result.durationMs,
      provider: this.id,
      model: request.model,
      sanitizedCommand: `${this.binary} ${args.join(' ')} (prompt via stdin, ${request.prompt.length} chars)`,
      timedOut: result.timedOut,
      error: result.timedOut
        ? 'Provider call timed out'
        : parsed.isError || result.exitCode !== 0
          ? 'Claude CLI reported an error result'
          : undefined,
    };
  }
}
