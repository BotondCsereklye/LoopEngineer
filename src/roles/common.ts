import type { ZodType, ZodTypeDef } from 'zod';
import type { RoleName } from '../domain/types.js';
import { InternalError, UserAbortError } from '../domain/errors.js';
import type { RoleConfig } from '../config/schema.js';
import { firewallPreamble } from '../security/context-firewall.js';
import { assertRolePermission } from '../security/permissions.js';
import { parseHandoff, type ValidationOutcome } from '../handoff/validator.js';
import type { AgentProvider, AgentRequest, AgentResponse } from '../providers/provider.js';

/** Version stamp for all role prompt templates. Bump on breaking prompt changes. */
export const PROMPT_VERSION = 1;

export interface RoleRunOptions {
  provider: AgentProvider;
  role: RoleName;
  roleConfig: RoleConfig;
  prompt: string;
  cwd: string;
  task: string;
  context: Record<string, unknown>;
  outputSchema: string;
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface RoleRunResult<T> {
  handoff: T;
  response: AgentResponse;
  validation: ValidationOutcome;
}

/**
 * Shared execution path for all LLM roles: re-assert permissions, invoke the
 * provider, then validate the structured handoff (one repair attempt max).
 */
export async function runStructuredRole<T, TInput>(
  options: RoleRunOptions,
  schema: ZodType<T, ZodTypeDef, TInput>,
): Promise<RoleRunResult<T>> {
  assertRolePermission(options.role, options.roleConfig.permissions);

  const request: AgentRequest = {
    role: options.role,
    prompt: options.prompt,
    task: options.task,
    cwd: options.cwd,
    permissionMode: options.roleConfig.permissions,
    context: options.context,
    outputSchema: options.outputSchema,
    timeoutMs: options.timeoutMs,
    model: options.roleConfig.model === 'default' ? undefined : options.roleConfig.model,
    signal: options.signal,
  };

  const response = await options.provider.run(request);

  if (options.signal?.aborted) {
    throw new UserAbortError();
  }
  if (response.timedOut) {
    throw new InternalError(
      `Provider "${options.provider.id}" timed out in role "${options.role}" after ${options.timeoutMs} ms`,
    );
  }
  if (response.exitCode !== 0 && response.text.trim() === '') {
    throw new InternalError(
      `Provider "${options.provider.id}" failed in role "${options.role}" (exit ${response.exitCode})`,
      response.stderr.slice(0, 2_000),
    );
  }

  // Prefer natively structured output when it already matches the schema.
  if (response.structured !== undefined) {
    const direct = schema.safeParse(response.structured);
    if (direct.success) {
      return { handoff: direct.data, response, validation: 'valid' };
    }
  }

  const parsed = parseHandoff(response.text, schema, `${options.role} (${options.provider.id})`);
  return { handoff: parsed.value, response, validation: parsed.outcome };
}

/** Assembles the final prompt from firewall preamble, role template and sections. */
export function composePrompt(role: RoleName, sections: string[]): string {
  return [firewallPreamble(role), ...sections].join('\n\n');
}

/** Truncates large artifacts (diffs, logs) before they enter a prompt. */
export function truncateForPrompt(text: string, limit = 60_000): string {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit)}\n… [truncated ${text.length - limit} characters]`;
}
