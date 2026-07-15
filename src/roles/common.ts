import type { ZodType, ZodTypeDef } from 'zod';
import type { RoleName } from '../domain/types.js';
import { InternalError, ProviderUnavailableError, UserAbortError } from '../domain/errors.js';
import type { RoleConfig } from '../config/schema.js';
import { firewallPreamble } from '../security/context-firewall.js';
import { assertRolePermission } from '../security/permissions.js';
import { parseHandoff, type ValidationOutcome } from '../handoff/validator.js';
import type { AgentProvider, AgentRequest, AgentResponse } from '../providers/provider.js';
import type { Logger } from '../logging/logger.js';

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
  logger?: Logger;
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
    effort:
      options.roleConfig.effort === undefined || options.roleConfig.effort === 'auto'
        ? undefined
        : options.roleConfig.effort,
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
  if (response.error && isProviderUnavailableMessage(response.text)) {
    throw new ProviderUnavailableError(
      `Provider "${options.provider.id}" cannot serve requests right now (role "${options.role}"): ${response.text.trim().slice(0, 200)}`,
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

/**
 * Recognizes provider-signaled outages (subscription/session limits, missing
 * login). Only consulted when the CLI itself reported an error — plain agent
 * text can never trigger this, so repository content cannot spoof it.
 */
export function isProviderUnavailableMessage(text: string): boolean {
  return /session limit|usage limit|rate limit|quota exceeded|not logged in|please (log|sign) ?in|run \/login|credit balance/i.test(
    text,
  );
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
