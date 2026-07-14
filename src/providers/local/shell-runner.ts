import { COMMAND_TIMEOUT_MS } from '../../config/defaults.js';
import { runProcess } from '../../execution/process-runner.js';
import type { CommandResult, TestResult } from '../../handoff/schemas.js';
import { validateCommand } from '../../security/command-policy.js';
import type {
  AgentProvider,
  AgentRequest,
  AgentResponse,
  ProviderAvailability,
} from '../provider.js';

const SUMMARY_LIMIT = 4_000;

/**
 * The tester role is NOT an LLM. This provider executes only the exact
 * commands configured under `commands` in loop-engineer.yml, one process per
 * command, without a shell. Anything that fails the command policy is
 * reported as blocked and never executed.
 *
 * Expected request.context: { commands: string[], allowlist: string[] }
 */
export class LocalShellProvider implements AgentProvider {
  readonly id = 'local';

  async checkAvailability(): Promise<ProviderAvailability> {
    return { installed: true, details: 'Local shell runner (predefined commands only).' };
  }

  async run(request: AgentRequest): Promise<AgentResponse> {
    const started = Date.now();
    const commands = asStringArray(request.context.commands);
    const allowlist = asStringArray(request.context.allowlist);

    const results: CommandResult[] = [];
    for (const command of commands) {
      results.push(await this.runOne(command, allowlist, request));
    }

    const testResult: TestResult = {
      passed: results.length > 0 && results.every((r) => r.exitCode === 0 && !r.blocked),
      commands: results,
    };
    if (results.length === 0) {
      // No configured commands: nothing executed, nothing failed.
      testResult.passed = true;
    }

    return {
      exitCode: 0,
      text: JSON.stringify(testResult),
      structured: testResult,
      stderr: '',
      durationMs: Date.now() - started,
      provider: this.id,
      sanitizedCommand: `local-shell-runner (${results.length} predefined command(s))`,
      timedOut: false,
    };
  }

  private async runOne(
    command: string,
    allowlist: string[],
    request: AgentRequest,
  ): Promise<CommandResult> {
    const validation = validateCommand(command, allowlist);
    if (!validation.allowed || !validation.argv) {
      return {
        command,
        exitCode: -1,
        durationMs: 0,
        stdoutSummary: '',
        stderrSummary: '',
        blocked: true,
        blockedReason: validation.reason ?? 'Blocked by command policy',
        timedOut: false,
      };
    }

    const [binary, ...args] = validation.argv;
    const result = await runProcess({
      command: binary,
      args,
      cwd: request.cwd,
      timeoutMs: Math.min(request.timeoutMs, COMMAND_TIMEOUT_MS),
      signal: request.signal,
    });

    return {
      command,
      exitCode: result.timedOut ? 124 : result.exitCode,
      durationMs: result.durationMs,
      stdoutSummary: tail(result.stdout, SUMMARY_LIMIT),
      stderrSummary: tail(result.stderr, SUMMARY_LIMIT),
      blocked: false,
      blockedReason: '',
      timedOut: result.timedOut,
    };
  }
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string' && item.trim() !== '');
}

/** Keeps the end of long output — failures usually appear last. */
function tail(text: string, limit: number): string {
  const trimmed = text.trim();
  return trimmed.length <= limit ? trimmed : `…${trimmed.slice(-limit)}`;
}
