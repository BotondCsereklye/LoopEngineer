import type { RunReport } from './types.js';

export function createJsonReport(report: RunReport): RunReport {
  return structuredClone(report);
}
