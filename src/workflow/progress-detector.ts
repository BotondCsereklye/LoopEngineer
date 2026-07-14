export interface ProgressSignals {
  diffHash: string;
  failedCommands: number;
  blockingFindings: number;
  satisfiedCriteria: number;
}

export interface ProgressResult {
  progressed: boolean;
  signals: string[];
}

export function evaluateProgress(
  previous: ProgressSignals,
  current: ProgressSignals,
): ProgressResult {
  const signals: string[] = [];
  if (previous.diffHash !== current.diffHash) signals.push('diff-changed');
  if (current.failedCommands < previous.failedCommands) signals.push('fewer-failed-commands');
  if (current.blockingFindings < previous.blockingFindings) signals.push('fewer-blocking-findings');
  if (current.satisfiedCriteria > previous.satisfiedCriteria)
    signals.push('more-criteria-satisfied');
  return { progressed: signals.length > 0, signals };
}
