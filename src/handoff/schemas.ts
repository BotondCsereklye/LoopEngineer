import { z } from 'zod';
import { SEVERITIES } from '../domain/types.js';

/**
 * Structured handoffs between roles. Agents never pass raw chat transcripts —
 * every step consumes and produces one of these validated shapes.
 */

export const repositoryAnalysisSchema = z.object({
  projectType: z.string(),
  languages: z.array(z.string()),
  frameworks: z.array(z.string()),
  importantFiles: z.array(z.string()),
  architectureSummary: z.string(),
  testCommands: z.array(z.string()),
  buildCommands: z.array(z.string()),
  instructionFiles: z.array(z.string()),
  risks: z.array(z.string()),
  constraints: z.array(z.string()),
});
export type RepositoryAnalysis = z.output<typeof repositoryAnalysisSchema>;

export const implementationPlanSchema = z.object({
  goal: z.string(),
  summary: z.string(),
  scope: z.array(z.string()),
  outOfScope: z.array(z.string()),
  acceptanceCriteria: z.array(z.string()).min(1),
  implementationSteps: z.array(z.string()).min(1),
  validationCommands: z.array(z.string()),
  forbiddenChanges: z.array(z.string()),
  risks: z.array(z.string()),
});
export type ImplementationPlan = z.output<typeof implementationPlanSchema>;

export const implementationSummarySchema = z.object({
  summary: z.string(),
  changedFiles: z.array(z.string()),
  notes: z.array(z.string()),
  deviationsFromPlan: z.array(z.string()),
});
export type ImplementationSummary = z.output<typeof implementationSummarySchema>;

export const reviewFindingSchema = z.object({
  severity: z.enum(SEVERITIES),
  category: z.string(),
  file: z.string(),
  line: z.number().int().nullable(),
  title: z.string(),
  description: z.string(),
  suggestedFix: z.string(),
});
export type ReviewFinding = z.output<typeof reviewFindingSchema>;

export const reviewResultSchema = z.object({
  approved: z.boolean(),
  summary: z.string(),
  findings: z.array(reviewFindingSchema),
});
export type ReviewResult = z.output<typeof reviewResultSchema>;

export const commandResultSchema = z.object({
  command: z.string(),
  exitCode: z.number().int(),
  durationMs: z.number(),
  stdoutSummary: z.string(),
  stderrSummary: z.string(),
  blocked: z.boolean().default(false),
  blockedReason: z.string().default(''),
  timedOut: z.boolean().default(false),
});
export type CommandResult = z.output<typeof commandResultSchema>;

export const testResultSchema = z.object({
  passed: z.boolean(),
  commands: z.array(commandResultSchema),
});
export type TestResult = z.output<typeof testResultSchema>;

export const finalDecisionSchema = z.object({
  readyForHumanReview: z.boolean(),
  summary: z.string(),
  acceptanceCriteriaSatisfied: z.array(z.string()),
  remainingIssues: z.array(z.string()),
  recommendedNextAction: z.string(),
});
export type FinalDecision = z.output<typeof finalDecisionSchema>;

export const HANDOFF_SCHEMAS = {
  RepositoryAnalysis: repositoryAnalysisSchema,
  ImplementationPlan: implementationPlanSchema,
  ImplementationSummary: implementationSummarySchema,
  ReviewResult: reviewResultSchema,
  TestResult: testResultSchema,
  FinalDecision: finalDecisionSchema,
} as const;

export type HandoffSchemaName = keyof typeof HANDOFF_SCHEMAS;
