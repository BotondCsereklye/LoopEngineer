import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createRunId } from '../../src/reports/run-id.js';
import { renderMarkdownReport } from '../../src/reports/markdown-report.js';
import { createRunStore } from '../../src/reports/run-store.js';
import type { RunReport } from '../../src/reports/types.js';

const report: RunReport = {
  runId: 'run-20260714-184500-a3f8',
  task: 'Add a feature',
  status: 'ready-for-human-review',
  startedAt: '2026-07-14T18:45:00.000Z',
  finishedAt: '2026-07-14T18:46:00.000Z',
  durationMs: 60_000,
  baseCommit: 'abc123',
  worktreePath: '/tmp/worktree',
  cycles: 1,
  roles: ['analyst', 'planner', 'implementer', 'tester', 'reviewer', 'final_judge'],
  providers: ['codex', 'claude', 'local'],
  diff: { filesChanged: 1, insertions: 2, deletions: 0, changedFiles: ['src/new.ts'] },
  tests: { passed: true, commands: [] },
  reviews: [{ approved: true, summary: 'Clean', findings: [] }],
  acceptanceCriteria: ['Feature works'],
  acceptanceCriteriaSatisfied: ['Feature works'],
  remainingIssues: [],
  securityWarnings: [],
  recommendedNextAction: 'Review and apply the worktree diff.',
  noCommitPerformed: true,
  noPushPerformed: true,
};

describe('run reports and store', () => {
  it('creates sortable, filesystem-safe run IDs', () => {
    expect(createRunId(new Date('2026-07-14T18:45:00Z'), () => 'a3f8')).toBe(
      'run-20260714-184500-a3f8',
    );
    expect(createRunId(new Date('2026-07-14T18:45:00Z'), () => '---')).toBe(
      'run-20260714-184500-0000',
    );
  });

  it('renders the required safety and quality evidence', () => {
    const markdown = renderMarkdownReport(report);
    expect(markdown).toContain('# Loop Engineer Report');
    expect(markdown).toContain('READY FOR HUMAN REVIEW');
    expect(markdown).toContain('No commit was performed');
    expect(markdown).toContain('src/new.ts');
  });

  it('redacts secrets before persisting JSON and JSONL', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'loopeng-store-'));
    const store = await createRunStore(root, report.runId);
    await store.writeJson('final-decision.json', { token: 'sk-12345678901234567890' });
    await store.writeJson('review-results/cycle-1.json', { approved: true });
    await store.appendEvent({ message: 'Authorization: Bearer abcdefghijklmnop' });

    expect(await readFile(path.join(store.path, 'final-decision.json'), 'utf8')).not.toContain(
      'sk-12345678901234567890',
    );
    expect(await readFile(path.join(store.path, 'provider-events.jsonl'), 'utf8')).toContain(
      '[REDACTED]',
    );
    expect(
      await readFile(path.join(store.path, 'review-results', 'cycle-1.json'), 'utf8'),
    ).toContain('"approved": true');
    await expect(store.writeText('../escape.txt', 'bad')).rejects.toThrow(/Invalid run artifact/);
  });
});
