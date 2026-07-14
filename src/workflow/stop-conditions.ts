export type StopReason = 'maximum-cycles' | 'maximum-runtime' | 'no-progress' | 'user-abort';

export interface StopConditionInput {
  cycle: number;
  maxCycles: number;
  startedAtMs: number;
  nowMs: number;
  maxRuntimeMs: number;
  stopOnNoProgress: boolean;
  progressed: boolean;
  aborted: boolean;
}

export interface StopDecision {
  stop: boolean;
  reason?: StopReason;
}

export function evaluateStopConditions(input: StopConditionInput): StopDecision {
  if (input.aborted) return { stop: true, reason: 'user-abort' };
  if (input.nowMs - input.startedAtMs > input.maxRuntimeMs) {
    return { stop: true, reason: 'maximum-runtime' };
  }
  if (input.cycle >= input.maxCycles) return { stop: true, reason: 'maximum-cycles' };
  if (input.stopOnNoProgress && !input.progressed) return { stop: true, reason: 'no-progress' };
  return { stop: false };
}
