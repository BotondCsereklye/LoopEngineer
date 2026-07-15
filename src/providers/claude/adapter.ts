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
    // `claude auth status` is the official non-interactive status probe. Its
    // output may contain account metadata, so only the exit code is used.
    const auth = await runProcess({
      command: this.binary,
      args: ['auth', 'status', '--json'],
      cwd: process.cwd(),
      timeoutMs: PROBE_TIMEOUT_MS,
    });
    const authenticated = auth.exitCode === 0;
    return {
      installed: true,
      version: version.stdout.trim(),
      authenticated,
      details: authenticated
        ? 'Claude Code CLI is installed and logged in.'
        : 'Claude Code CLI is installed but not logged in. Run `claude auth login --claudeai`.',
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
    if (request.effort && request.effort !== 'auto') {
      args.push('--effort', request.effort);
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
