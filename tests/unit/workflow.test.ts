import { describe, expect, it } from 'vitest';
import { evaluateProgress } from '../../src/workflow/progress-detector.js';
import { evaluateStopConditions } from '../../src/workflow/stop-conditions.js';
import {
  createInitialWorkflowState,
  transitionWorkflow,
} from '../../src/workflow/workflow-state.js';

describe('workflow state', () => {
  it('allows the documented phase sequence and rejects invalid transitions', () => {
    const initial = createInitialWorkflowState(new Date('2026-07-14T18:45:00Z'));
    const analyzed = transitionWorkflow(initial, 'PLAN');

    expect(analyzed.phase).toBe('PLAN');
    expect(() => transitionWorkflow(analyzed, 'TEST')).toThrow(/Invalid workflow transition/);
  });
});

describe('progress detector', () => {
  it('detects progress from a changed diff or fewer blockers and otherwise stops', () => {
    expect(
      evaluateProgress(
        { diffHash: 'a', failedCommands: 2, blockingFindings: 2, satisfiedCriteria: 0 },
        { diffHash: 'b', failedCommands: 2, blockingFindings: 2, satisfiedCriteria: 0 },
      ).progressed,
    ).toBe(true);
    expect(
      evaluateProgress(
        { diffHash: 'a', failedCommands: 1, blockingFindings: 1, satisfiedCriteria: 2 },
        { diffHash: 'a', failedCommands: 1, blockingFindings: 1, satisfiedCriteria: 2 },
      ).progressed,
    ).toBe(false);
    expect(
      evaluateProgress(
        { diffHash: 'a', failedCommands: 3, blockingFindings: 2, satisfiedCriteria: 0 },
        { diffHash: 'a', failedCommands: 1, blockingFindings: 0, satisfiedCriteria: 2 },
      ).signals,
    ).toEqual(['fewer-failed-commands', 'fewer-blocking-findings', 'more-criteria-satisfied']);
  });
});

describe('stop conditions', () => {
  it('stops at the cycle and runtime limits', () => {
    expect(
      evaluateStopConditions({
        cycle: 3,
        maxCycles: 3,
        startedAtMs: 0,
        nowMs: 1,
        maxRuntimeMs: 60_000,
        stopOnNoProgress: false,
        progressed: true,
        aborted: false,
      }),
    ).toEqual({ stop: true, reason: 'maximum-cycles' });

    expect(
      evaluateStopConditions({
        cycle: 1,
        maxCycles: 3,
        startedAtMs: 0,
        nowMs: 60_001,
        maxRuntimeMs: 60_000,
        stopOnNoProgress: false,
        progressed: true,
        aborted: false,
      }),
    ).toEqual({ stop: true, reason: 'maximum-runtime' });
    expect(
      evaluateStopConditions({
        cycle: 1,
        maxCycles: 3,
        startedAtMs: 0,
        nowMs: 1,
        maxRuntimeMs: 10,
        stopOnNoProgress: true,
        progressed: false,
        aborted: false,
      }),
    ).toEqual({ stop: true, reason: 'no-progress' });
    expect(
      evaluateStopConditions({
        cycle: 1,
        maxCycles: 3,
        startedAtMs: 0,
        nowMs: 1,
        maxRuntimeMs: 10,
        stopOnNoProgress: false,
        progressed: true,
        aborted: true,
      }),
    ).toEqual({ stop: true, reason: 'user-abort' });
    expect(
      evaluateStopConditions({
        cycle: 1,
        maxCycles: 3,
        startedAtMs: 0,
        nowMs: 1,
        maxRuntimeMs: 10,
        stopOnNoProgress: false,
        progressed: true,
        aborted: false,
      }),
    ).toEqual({ stop: false });
  });
});
