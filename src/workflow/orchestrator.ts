import { stringify as stringifyYaml } from 'yaml';
import type { ZodType, ZodTypeDef } from 'zod';
import type { LoopEngineerConfig } from '../config/schema.js';
import { AGENT_TIMEOUT_MS } from '../config/defaults.js';
import { ProviderOutputError, ProviderUnavailableError, UserAbortError } from '../domain/errors.js';
import type { RoleName } from '../domain/types.js';
import { currentCommit } from '../git/repository.js';
import { worktreeDiff, type WorktreeDiff } from '../git/diff.js';
import { createWorktree } from '../git/worktree.js';
import type {
  FinalDecision,
  ImplementationPlan,
  RepositoryAnalysis,
  ReviewResult,
  TestResult,
} from '../handoff/schemas.js';
import { providerEvent } from '../logging/run-log.js';
import { silentLogger, type Logger } from '../logging/logger.js';
import type { ProviderRegistry } from '../providers/provider.js';
import { providerForRole, usedProviders } from '../providers/registry.js';
import { createJsonReport } from '../reports/json-report.js';
import { renderMarkdownReport } from '../reports/markdown-report.js';
import { createRunId } from '../reports/run-id.js';
import { createRunStore, type RunStore } from '../reports/run-store.js';
import type { RunReport } from '../reports/types.js';
import { analystRole } from '../roles/analyst.js';
import { finalJudgeRole } from '../roles/final-judge.js';
import { fixerRole } from '../roles/fixer.js';
import { implementerRole } from '../roles/implementer.js';
import { plannerRole } from '../roles/planner.js';
import { reviewerRole } from '../roles/reviewer.js';
import { testerRole } from '../roles/tester.js';
import { runStructuredRole, type RoleRunOptions, type RoleRunResult } from '../roles/common.js';
import { evaluateProgress, type ProgressSignals } from './progress-detector.js';
import { evaluateQualityGates } from './quality-gates.js';
import { evaluateStopConditions } from './stop-conditions.js';
import { createInitialWorkflowState, transitionWorkflow } from './workflow-state.js';

export interface OrchestratorOptions {
  task: string;
  repoRoot: string;
  config: LoopEngineerConfig;
  registry: ProviderRegistry;
  dryRun?: boolean;
  signal?: AbortSignal;
  logger?: Logger;
  now?: () => Date;
}

export interface OrchestratorResult {
  report: RunReport;
  reportPath?: string;
  dryRun: boolean;
}

const EMPTY_TESTS: TestResult = { passed: true, commands: [] };
const EMPTY_DIFF: WorktreeDiff = {
  patch: '',
  hash: '',
  stats: { filesChanged: 0, insertions: 0, deletions: 0, changedFiles: [] },
};

export async function orchestrate(options: OrchestratorOptions): Promise<OrchestratorResult> {
  const now = options.now ?? (() => new Date());
  const started = now();
  const startedAtMs = started.getTime();
  const runId = createRunId(started);
  const logger = options.logger ?? silentLogger;
  const baseCommit = await currentCommit(options.repoRoot);

  if (options.dryRun) {
    return {
      dryRun: true,
      report: dryRunReport(runId, options.task, baseCommit, started),
    };
  }

  assertNotAborted(options.signal);
  await assertProvidersAvailable(options.registry, options.config);
  const store = await createRunStore(options.repoRoot, runId);
  await store.writeText('task.md', `${options.task.trim()}\n`);
  await store.writeText('config.snapshot.yml', stringifyYaml(options.config));

  const worktree = await createWorktree(options.repoRoot, runId, baseCommit, started);
  const rolesUsed: RoleName[] = [];
  const reviews: ReviewResult[] = [];
  let state = createInitialWorkflowState(started);
  let cycle = state.cycle;

  logger.info(`[1/7] Analyzing repository`);
  const analysisRun = await executeStructuredRole(
    store,
    'analyst-cycle-1',
    roleOptions(
      options,
      'analyst',
      options.repoRoot,
      analystRole.prompt(options.task, { repoRoot: options.repoRoot }),
      'RepositoryAnalysis',
      { repoRoot: options.repoRoot },
    ),
    analystRole.schema,
  );
  rolesUsed.push('analyst');
  await recordRole(store, analysisRun, 'ANALYZE', cycle, 'analyst');
  const analysis: RepositoryAnalysis = analysisRun.handoff;
  await store.writeJson('repository-analysis.json', analysis);
  state = transitionWorkflow(state, 'PLAN');

  logger.info(`[2/7] Creating implementation plan`);
  const planRun = await executeStructuredRole(
    store,
    'planner-cycle-1',
    roleOptions(
      options,
      'planner',
      options.repoRoot,
      plannerRole.prompt(options.task, { analysis }),
      'ImplementationPlan',
      { analysis },
    ),
    plannerRole.schema,
  );
  rolesUsed.push('planner');
  await recordRole(store, planRun, 'PLAN', cycle, 'planner');
  const plan: ImplementationPlan = planRun.handoff;
  await store.writeJson('implementation-plan.json', plan);
  state = transitionWorkflow(state, 'IMPLEMENT');

  logger.info(`[3/7] Isolated worktree: ${worktree.path}`);
  const implementRun = await executeStructuredRole(
    store,
    'implementer-cycle-1',
    roleOptions(
      options,
      'implementer',
      worktree.path,
      implementerRole.prompt(options.task, { plan }),
      'ImplementationSummary',
      { plan },
    ),
    implementerRole.schema,
  );
  rolesUsed.push('implementer');
  await recordRole(store, implementRun, 'IMPLEMENT', cycle, 'implementer');
  state = transitionWorkflow(state, 'TEST');

  let diff = await worktreeDiff(worktree.path, baseCommit);
  let tests = await runTests(options, worktree.path, store, cycle, rolesUsed);
  state = transitionWorkflow(state, 'REVIEW');
  let review = await runReview(options, worktree.path, store, cycle, plan, diff, tests, rolesUsed);
  reviews.push(review);
  let gates = evaluateQualityGates(options.config, tests, review);
  let previousSignals = signals(diff, tests, gates.blockingFindings, 0);
  let stopReason: string | undefined;

  while (!gates.passed) {
    const beforeFix = evaluateStopConditions({
      cycle,
      maxCycles: options.config.workflow.max_cycles,
      startedAtMs,
      nowMs: now().getTime(),
      maxRuntimeMs: options.config.workflow.max_runtime_minutes * 60_000,
      stopOnNoProgress: false,
      progressed: true,
      aborted: options.signal?.aborted ?? false,
    });
    if (beforeFix.stop) {
      stopReason = beforeFix.reason;
      break;
    }

    state = transitionWorkflow(state, 'FIX');
    cycle = state.cycle;
    logger.info(`Starting correction cycle ${cycle}/${options.config.workflow.max_cycles}`);
    const fixRun = await executeStructuredRole(
      store,
      `fixer-cycle-${cycle}`,
      roleOptions(
        options,
        'fixer',
        worktree.path,
        fixerRole.prompt(options.task, { plan, diff: diff.patch, tests, review }),
        'ImplementationSummary',
        { plan, diff: diff.patch, tests, review },
      ),
      fixerRole.schema,
    );
    rolesUsed.push('fixer');
    await recordRole(store, fixRun, 'FIX', cycle, 'fixer');
    state = transitionWorkflow(state, 'TEST');
    diff = await worktreeDiff(worktree.path, baseCommit);
    tests = await runTests(options, worktree.path, store, cycle, rolesUsed);
    state = transitionWorkflow(state, 'REVIEW');
    review = await runReview(options, worktree.path, store, cycle, plan, diff, tests, rolesUsed);
    reviews.push(review);
    gates = evaluateQualityGates(options.config, tests, review);

    const currentSignals = signals(diff, tests, gates.blockingFindings, 0);
    const progress = evaluateProgress(previousSignals, currentSignals);
    previousSignals = currentSignals;
    const afterFix = evaluateStopConditions({
      cycle,
      maxCycles: options.config.workflow.max_cycles,
      startedAtMs,
      nowMs: now().getTime(),
      maxRuntimeMs: options.config.workflow.max_runtime_minutes * 60_000,
      stopOnNoProgress: options.config.workflow.stop_on_no_progress,
      progressed: progress.progressed,
      aborted: options.signal?.aborted ?? false,
    });
    if (!gates.passed && afterFix.stop) {
      stopReason = afterFix.reason;
      break;
    }
  }

  logger.info('[7/7] Final validation');
  state = transitionWorkflow(state, 'DECIDE');
  const objectiveReady = gates.passed && stopReason === undefined;
  const judgeRun = await executeStructuredRole(
    store,
    `final-judge-cycle-${cycle}`,
    roleOptions(
      options,
      'final_judge',
      options.repoRoot,
      finalJudgeRole.prompt(options.task, { plan, tests, review, qualityGates: gates, stopReason }),
      'FinalDecision',
      { plan, tests, review, qualityGates: gates, stopReason },
    ),
    finalJudgeRole.schema,
  );
  rolesUsed.push('final_judge');
  await recordRole(store, judgeRun, 'DECIDE', cycle, 'final_judge');
  const decision = clampDecision(judgeRun.handoff, objectiveReady, gates.failures, stopReason);
  await store.writeJson('final-decision.json', decision);

  const finished = now();
  const report: RunReport = {
    runId,
    task: options.task,
    status: decision.readyForHumanReview ? 'ready-for-human-review' : 'quality-gates-not-met',
    startedAt: started.toISOString(),
    finishedAt: finished.toISOString(),
    durationMs: Math.max(0, finished.getTime() - startedAtMs),
    baseCommit,
    worktreePath: worktree.path,
    cycles: cycle,
    roles: unique(rolesUsed),
    providers: usedProviders(options.registry, options.config).map((provider) => provider.id),
    diff: diff.stats,
    tests,
    reviews,
    acceptanceCriteria: plan.acceptanceCriteria,
    acceptanceCriteriaSatisfied: decision.acceptanceCriteriaSatisfied,
    remainingIssues: decision.remainingIssues,
    securityWarnings: [],
    recommendedNextAction: decision.recommendedNextAction,
    noCommitPerformed: true,
    noPushPerformed: true,
  };
  await store.writeJson('test-results.json', tests);
  await store.writeJson('report.json', createJsonReport(report));
  await store.writeText('report.md', renderMarkdownReport(report));

  return { report, reportPath: `${store.path}/report.md`, dryRun: false };
}

function roleOptions(
  options: OrchestratorOptions,
  role: RoleName,
  cwd: string,
  prompt: string,
  outputSchema: string,
  context: Record<string, unknown> = {},
) {
  return {
    provider: providerForRole(options.registry, options.config, role),
    role,
    roleConfig: options.config.roles[role],
    prompt,
    cwd,
    task: options.task,
    context,
    outputSchema,
    timeoutMs: AGENT_TIMEOUT_MS,
    signal: options.signal,
    logger: options.logger,
  };
}

async function runTests(
  options: OrchestratorOptions,
  cwd: string,
  store: RunStore,
  cycle: number,
  rolesUsed: RoleName[],
): Promise<TestResult> {
  const commands = [
    options.config.commands.build,
    options.config.commands.test,
    options.config.commands.lint,
    options.config.commands.typecheck,
  ].filter((command) => command.trim() !== '');
  if (commands.length === 0) return EMPTY_TESTS;
  const context = { commands, allowlist: commands };
  const base = roleOptions(
    options,
    'tester',
    cwd,
    testerRole.prompt(options.task, context),
    'TestResult',
    context,
  );
  const run = await executeStructuredRole(
    store,
    `tester-cycle-${cycle}`,
    { ...base, context },
    testerRole.schema,
  );
  rolesUsed.push('tester');
  await recordRole(store, run, 'TEST', cycle, 'tester');
  return run.handoff;
}

async function runReview(
  options: OrchestratorOptions,
  cwd: string,
  store: RunStore,
  cycle: number,
  plan: ImplementationPlan,
  diff: WorktreeDiff,
  tests: TestResult,
  rolesUsed: RoleName[],
): Promise<ReviewResult> {
  const context = { plan, diff: diff.patch, diffStats: diff.stats, tests };
  const run = await executeStructuredRole(
    store,
    `reviewer-cycle-${cycle}`,
    roleOptions(
      options,
      'reviewer',
      cwd,
      reviewerRole.prompt(options.task, context),
      'ReviewResult',
      context,
    ),
    reviewerRole.schema,
  );
  rolesUsed.push('reviewer');
  await recordRole(store, run, 'REVIEW', cycle, 'reviewer');
  await store.writeJson(`review-results/cycle-${cycle}.json`, run.handoff);
  return run.handoff;
}

async function recordRole<T>(
  store: RunStore,
  run: RoleRunResult<T>,
  phase: Parameters<typeof providerEvent>[1],
  cycle: number,
  role: RoleName,
): Promise<void> {
  await store.appendEvent(providerEvent(run.response, phase, cycle, role, run.validation));
}

async function executeStructuredRole<T, TInput>(
  store: RunStore,
  artifactLabel: string,
  options: RoleRunOptions,
  schema: ZodType<T, ZodTypeDef, TInput>,
): Promise<RoleRunResult<T>> {
  const startedAt = new Date().toISOString();
  const activity = {
    role: options.role,
    provider: options.provider.id,
    model: options.roleConfig.model,
    effort: options.roleConfig.effort ?? 'auto',
    startedAt,
  } as const;
  options.logger?.activity?.({ ...activity, state: 'thinking' });
  try {
    const result = await runStructuredRole(options, schema);
    options.logger?.activity?.({
      ...activity,
      state: 'completed',
      finishedAt: new Date().toISOString(),
    });
    return result;
  } catch (error) {
    options.logger?.activity?.({
      ...activity,
      state: 'failed',
      finishedAt: new Date().toISOString(),
    });
    if (error instanceof ProviderOutputError) {
      await store.writeText(`raw-output-${artifactLabel}.txt`, error.rawOutput);
    }
    throw error;
  }
}

async function assertProvidersAvailable(
  registry: ProviderRegistry,
  config: LoopEngineerConfig,
): Promise<void> {
  for (const provider of usedProviders(registry, config)) {
    const availability = await provider.checkAvailability();
    if (!availability.installed) {
      throw new ProviderUnavailableError(
        `Provider "${provider.id}" is unavailable`,
        availability.details,
      );
    }
  }
}

function clampDecision(
  decision: FinalDecision,
  objectiveReady: boolean,
  failures: string[],
  stopReason?: string,
): FinalDecision {
  if (objectiveReady && decision.readyForHumanReview) return decision;
  const remainingIssues = [...decision.remainingIssues, ...failures];
  if (stopReason) remainingIssues.push(`Workflow stopped: ${stopReason}`);
  return {
    ...decision,
    readyForHumanReview: false,
    remainingIssues: unique(remainingIssues),
    recommendedNextAction:
      decision.recommendedNextAction || 'Resolve the remaining quality-gate failures.',
  };
}

function signals(
  diff: WorktreeDiff,
  tests: TestResult,
  blockingFindings: number,
  satisfiedCriteria: number,
): ProgressSignals {
  return {
    diffHash: diff.hash,
    failedCommands: tests.commands.filter((command) => command.exitCode !== 0 || command.blocked)
      .length,
    blockingFindings,
    satisfiedCriteria,
  };
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function assertNotAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw new UserAbortError();
}

function dryRunReport(runId: string, task: string, baseCommit: string, now: Date): RunReport {
  return {
    runId,
    task,
    status: 'quality-gates-not-met',
    startedAt: now.toISOString(),
    finishedAt: now.toISOString(),
    durationMs: 0,
    baseCommit,
    worktreePath: 'not-created (dry-run)',
    cycles: 0,
    roles: [],
    providers: [],
    diff: EMPTY_DIFF.stats,
    tests: EMPTY_TESTS,
    reviews: [],
    acceptanceCriteria: [],
    acceptanceCriteriaSatisfied: [],
    remainingIssues: ['Dry run only; no providers or worktree were invoked.'],
    securityWarnings: [],
    recommendedNextAction: 'Run without --dry-run to execute the workflow.',
    noCommitPerformed: true,
    noPushPerformed: true,
  };
}
