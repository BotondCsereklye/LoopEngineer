import type { DiffStats, RoleName, RunStatus } from '../domain/types.js';
import type { ReviewResult, TestResult } from '../handoff/schemas.js';

export interface RunReport {
  runId: string;
  task: string;
  status: RunStatus;
  startedAt: string;
  finishedAt: string;
  durationMs: number;
  baseCommit: string;
  worktreePath: string;
  cycles: number;
  roles: RoleName[];
  providers: string[];
  diff: DiffStats;
  tests: TestResult;
  reviews: ReviewResult[];
  acceptanceCriteria: string[];
  acceptanceCriteriaSatisfied: string[];
  remainingIssues: string[];
  securityWarnings: string[];
  recommendedNextAction: string;
  noCommitPerformed: true;
  noPushPerformed: true;
}
