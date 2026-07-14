import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR_NAME, RUNS_DIR_NAME } from '../../config/defaults.js';
import type { RunReport } from '../../reports/types.js';

export async function listRunReports(root: string): Promise<RunReport[]> {
  const runsPath = path.join(root, DATA_DIR_NAME, RUNS_DIR_NAME);
  if (!existsSync(runsPath)) return [];
  const entries = (await readdir(runsPath, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && entry.name.startsWith('run-'))
    .map((entry) => entry.name)
    .sort()
    .reverse();
  const reports: RunReport[] = [];
  for (const runId of entries) {
    try {
      reports.push(
        JSON.parse(await readFile(path.join(runsPath, runId, 'report.json'), 'utf8')) as RunReport,
      );
    } catch {
      // An interrupted run may not have a final report yet.
    }
  }
  return reports;
}

export async function readRunReport(root: string, runId: string): Promise<string> {
  if (!/^run-[A-Za-z0-9-]+$/.test(runId)) throw new Error('Invalid run ID');
  return readFile(path.join(root, DATA_DIR_NAME, RUNS_DIR_NAME, runId, 'report.md'), 'utf8');
}
