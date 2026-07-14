/**
 * Core domain types shared across Loop Engineer.
 */

export const ROLE_NAMES = [
  'analyst',
  'planner',
  'implementer',
  'reviewer',
  'tester',
  'fixer',
  'final_judge',
] as const;

export type RoleName = (typeof ROLE_NAMES)[number];

export const PROVIDER_IDS = ['claude', 'codex', 'local', 'fake'] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export const PERMISSION_MODES = ['read-only', 'workspace-write', 'predefined-commands'] as const;

export type PermissionMode = (typeof PERMISSION_MODES)[number];

export const SEVERITIES = ['critical', 'high', 'medium', 'low', 'info'] as const;

export type Severity = (typeof SEVERITIES)[number];

export type RunStatus =
  | 'ready-for-human-review'
  | 'quality-gates-not-met'
  | 'config-error'
  | 'provider-unavailable'
  | 'security-abort'
  | 'internal-error'
  | 'user-abort';

/** Exit codes documented in README and docs/workflow.md. */
export const EXIT_CODES: Record<RunStatus, number> = {
  'ready-for-human-review': 0,
  'quality-gates-not-met': 1,
  'config-error': 2,
  'provider-unavailable': 3,
  'security-abort': 4,
  'internal-error': 5,
  'user-abort': 130,
};

export type WorkflowPhase = 'ANALYZE' | 'PLAN' | 'IMPLEMENT' | 'TEST' | 'REVIEW' | 'FIX' | 'DECIDE';

export interface DiffStats {
  filesChanged: number;
  insertions: number;
  deletions: number;
  changedFiles: string[];
}

export interface ProviderEvent {
  timestamp: string;
  phase: WorkflowPhase;
  cycle: number;
  role: RoleName;
  provider: string;
  model?: string;
  sanitizedCommand: string;
  exitCode: number;
  durationMs: number;
  validation: string;
  outputExcerpt: string;
}
