import type { RoleName } from '../domain/types.js';
import { wrapUntrusted } from '../security/context-firewall.js';
import { composePrompt, PROMPT_VERSION, truncateForPrompt } from './common.js';

const ROLE_INSTRUCTIONS: Readonly<Record<RoleName, string>> = {
  analyst: 'Analyze the repository read-only. Return only RepositoryAnalysis JSON.',
  planner:
    'Create a minimal implementation plan with objective acceptance criteria. Return only ImplementationPlan JSON.',
  implementer:
    'Implement only the approved plan inside the provided worktree. Do not commit or push. Return only ImplementationSummary JSON.',
  reviewer:
    'Review the plan, diff and tests for correctness, security, architecture and scope. Return only ReviewResult JSON with concrete findings.',
  tester: 'Execute only the predefined commands. Return only TestResult JSON.',
  fixer:
    'Fix only evidenced test failures and review findings in the same worktree. Do not commit or push. Return only ImplementationSummary JSON.',
  final_judge:
    'Evaluate objective quality gates and acceptance criteria. Do not override failing gates. Return only FinalDecision JSON.',
};

export function rolePrompt(role: RoleName, task: string, context: Record<string, unknown>): string {
  return composePrompt(role, [
    `Loop Engineer prompt version: ${PROMPT_VERSION}`,
    ROLE_INSTRUCTIONS[role],
    `USER TASK (trusted):\n${truncateForPrompt(task, 10_000)}`,
    `STRUCTURED CONTEXT:\n${wrapUntrusted('role-context', truncateForPrompt(JSON.stringify(context, null, 2)))}`,
    'Do not provide hidden reasoning or chain-of-thought. Provide only the requested structured result and concise evidence fields.',
  ]);
}
