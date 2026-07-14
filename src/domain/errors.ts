import { EXIT_CODES, type RunStatus } from './types.js';

/**
 * Base class for all Loop Engineer errors. Every error maps to a run status
 * and therefore to a documented process exit code.
 */
export abstract class LoopEngineerError extends Error {
  abstract readonly status: RunStatus;

  get exitCode(): number {
    return EXIT_CODES[this.status];
  }

  constructor(
    message: string,
    readonly details?: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Invalid, missing or unreadable configuration / invalid invocation. */
export class ConfigurationError extends LoopEngineerError {
  readonly status: RunStatus = 'config-error';
}

/** A required provider CLI is missing or reports itself unusable. */
export class ProviderUnavailableError extends LoopEngineerError {
  readonly status: RunStatus = 'provider-unavailable';
}

/** A provider repeatedly produced output that failed schema validation. */
export class ProviderOutputError extends LoopEngineerError {
  readonly status: RunStatus = 'internal-error';

  constructor(
    message: string,
    readonly rawOutput: string,
    details?: string,
  ) {
    super(message, details);
  }
}

/** A security rule was violated (command policy, permissions, firewall). */
export class SecurityViolationError extends LoopEngineerError {
  readonly status: RunStatus = 'security-abort';
}

/** Git worktree operations failed or would endanger user data. */
export class WorktreeError extends LoopEngineerError {
  readonly status: RunStatus = 'internal-error';
}

/** The user cancelled the run (SIGINT / SIGTERM / abort signal). */
export class UserAbortError extends LoopEngineerError {
  readonly status: RunStatus = 'user-abort';

  constructor(message = 'Run aborted by user') {
    super(message);
  }
}

/** Unexpected internal failure. */
export class InternalError extends LoopEngineerError {
  readonly status: RunStatus = 'internal-error';
}

/** Maps any thrown value to a process exit code. */
export function exitCodeForError(error: unknown): number {
  if (error instanceof LoopEngineerError) {
    return error.exitCode;
  }
  return EXIT_CODES['internal-error'];
}

/** Maps any thrown value to a run status. */
export function statusForError(error: unknown): RunStatus {
  if (error instanceof LoopEngineerError) {
    return error.status;
  }
  return 'internal-error';
}
