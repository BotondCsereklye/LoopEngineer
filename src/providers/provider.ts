import type { PermissionMode, RoleName } from '../domain/types.js';

export interface ProviderAvailability {
  installed: boolean;
  version?: string;
  /** true / false only when reliably verifiable via official means; undefined = unknown. */
  authenticated?: boolean;
  details: string;
}

export interface AgentRequest {
  role: RoleName;
  /** Fully rendered prompt (firewall preamble + role template + wrapped context). */
  prompt: string;
  /** The user task, for logging only. */
  task: string;
  /** Directory the agent operates in (repo root for read-only, worktree for write roles). */
  cwd: string;
  permissionMode: PermissionMode;
  /** Structured context that role templates already embedded into the prompt. */
  context: Record<string, unknown>;
  /** Name of the expected output schema (for logging/diagnostics). */
  outputSchema: string;
  timeoutMs: number;
  model?: string;
  previousHandoff?: unknown;
  signal?: AbortSignal;
}

export interface AgentResponse {
  exitCode: number;
  /** Normalized text output (the agent's final message). */
  text: string;
  /** Structured output, if the provider natively produced one. */
  structured?: unknown;
  stderr: string;
  durationMs: number;
  provider: string;
  model?: string;
  /** The executed command with arguments, sanitized for logs (prompt elided). */
  sanitizedCommand: string;
  timedOut: boolean;
  error?: string;
}

export interface AgentProvider {
  readonly id: string;
  checkAvailability(): Promise<ProviderAvailability>;
  run(request: AgentRequest): Promise<AgentResponse>;
}

export type ProviderRegistry = ReadonlyMap<string, AgentProvider>;
