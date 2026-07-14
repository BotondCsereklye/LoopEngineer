import type { WorkflowPhase } from '../domain/types.js';
import { InternalError } from '../domain/errors.js';

export interface WorkflowState {
  phase: WorkflowPhase;
  cycle: number;
  startedAt: string;
  history: WorkflowPhase[];
}

const TRANSITIONS: Readonly<Record<WorkflowPhase, readonly WorkflowPhase[]>> = {
  ANALYZE: ['PLAN'],
  PLAN: ['IMPLEMENT'],
  IMPLEMENT: ['TEST'],
  TEST: ['REVIEW'],
  REVIEW: ['FIX', 'DECIDE'],
  FIX: ['TEST'],
  DECIDE: [],
};

export function createInitialWorkflowState(now = new Date()): WorkflowState {
  return { phase: 'ANALYZE', cycle: 1, startedAt: now.toISOString(), history: ['ANALYZE'] };
}

export function transitionWorkflow(state: WorkflowState, phase: WorkflowPhase): WorkflowState {
  if (!TRANSITIONS[state.phase].includes(phase)) {
    throw new InternalError(`Invalid workflow transition: ${state.phase} -> ${phase}`);
  }
  return {
    ...state,
    phase,
    cycle: phase === 'FIX' ? state.cycle + 1 : state.cycle,
    history: [...state.history, phase],
  };
}
