import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/config/defaults.js';
import { createGuiServer, type GuiServices } from '../../src/gui/server.js';
import type { GuiRunRequest } from '../../src/gui/schema.js';

const request: GuiRunRequest = {
  task: 'Preview a safe change',
  dryRun: true,
  workflow: { maxCycles: 3, maxRuntimeMinutes: 60, stopOnNoProgress: true },
  roles: {
    analyst: { provider: 'codex', model: 'default' },
    planner: { provider: 'claude', model: 'default' },
    implementer: { provider: 'codex', model: 'default' },
    reviewer: { provider: 'claude', model: 'default' },
    fixer: { provider: 'codex', model: 'default' },
    final_judge: { provider: 'claude', model: 'default' },
  },
  qualityGates: {
    requireTestsPass: true,
    requireCleanReview: true,
    blockSeverities: ['critical', 'high'],
  },
  commands: { build: '', test: '', lint: '', typecheck: '' },
};

describe('local GUI server', () => {
  it('serves the dashboard, bootstraps local state and completes a dry run', async () => {
    const services = fakeServices();
    const gui = await createGuiServer({
      host: '127.0.0.1',
      port: 0,
      services,
      csrfToken: 'test-token',
    });
    try {
      const page = await fetch(gui.url);
      expect(page.status).toBe(200);
      expect(page.headers.get('content-security-policy')).toContain("default-src 'self'");
      expect(await page.text()).toContain('Loop Engineer');

      const bootstrap = (await fetch(`${gui.url}/api/bootstrap`).then((response) =>
        response.json(),
      )) as {
        csrfToken: string;
        config: { version: number };
      };
      expect(bootstrap).toMatchObject({ csrfToken: 'test-token', config: { version: 1 } });

      const forbidden = await fetch(`${gui.url}/api/run`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', origin: gui.url },
        body: JSON.stringify(request),
      });
      expect(forbidden.status).toBe(403);

      const started = await fetch(`${gui.url}/api/run`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: gui.url,
          'x-loop-csrf': 'test-token',
        },
        body: JSON.stringify(request),
      });
      expect(started.status).toBe(202);
      await new Promise((resolve) => setTimeout(resolve, 0));

      const snapshot = (await fetch(`${gui.url}/api/run`).then((response) => response.json())) as {
        status: string;
        result?: { dryRun: boolean };
      };
      expect(snapshot).toMatchObject({ status: 'completed', result: { dryRun: true } });
      expect(services.runRequests).toEqual([request]);
    } finally {
      await gui.close();
    }
  });

  it('rejects invalid JSON, unsafe origins and unknown routes', async () => {
    const gui = await createGuiServer({
      host: '127.0.0.1',
      port: 0,
      services: fakeServices(),
      csrfToken: 'token',
    });
    try {
      const invalid = await fetch(`${gui.url}/api/run`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: gui.url,
          'x-loop-csrf': 'token',
        },
        body: '{bad',
      });
      expect(invalid.status).toBe(400);

      const wrongOrigin = await fetch(`${gui.url}/api/run`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: 'https://attacker.example',
          'x-loop-csrf': 'token',
        },
        body: JSON.stringify(request),
      });
      expect(wrongOrigin.status).toBe(403);
      expect((await fetch(`${gui.url}/missing`)).status).toBe(404);

      const badRunId = await fetch(`${gui.url}/api/reports/not.a.run.id`);
      expect(badRunId.status).toBe(400);
      const report = await fetch(`${gui.url}/api/reports/run-test`);
      expect(report.status).toBe(200);
      expect(await report.text()).toBe('# report');

      const schemaViolation = await fetch(`${gui.url}/api/run`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          origin: gui.url,
          'x-loop-csrf': 'token',
        },
        body: JSON.stringify({ ...request, task: '' }),
      });
      expect(schemaViolation.status).toBe(400);
    } finally {
      await gui.close();
    }
  });

  it('cancels an active run, rejects duplicates and reports run failures', async () => {
    const services = fakeServices();
    // A run that only finishes when it is cancelled.
    services.run = (_request, signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
      });
    const gui = await createGuiServer({
      host: '127.0.0.1',
      port: 0,
      services,
      csrfToken: 'token',
    });
    const mutationHeaders = {
      'content-type': 'application/json',
      origin: gui.url,
      'x-loop-csrf': 'token',
    };
    try {
      const noActive = await fetch(`${gui.url}/api/cancel`, {
        method: 'POST',
        headers: mutationHeaders,
      });
      expect(noActive.status).toBe(409);

      const started = await fetch(`${gui.url}/api/run`, {
        method: 'POST',
        headers: mutationHeaders,
        body: JSON.stringify(request),
      });
      expect(started.status).toBe(202);

      const duplicate = await fetch(`${gui.url}/api/run`, {
        method: 'POST',
        headers: mutationHeaders,
        body: JSON.stringify(request),
      });
      expect(duplicate.status).toBe(409);

      const cancelled = await fetch(`${gui.url}/api/cancel`, {
        method: 'POST',
        headers: mutationHeaders,
      });
      expect(cancelled.status).toBe(202);
      await new Promise((resolve) => setTimeout(resolve, 10));
      const snapshot = (await fetch(`${gui.url}/api/run`).then((response) => response.json())) as {
        status: string;
      };
      expect(snapshot.status).toBe('cancelled');

      // A run that fails immediately surfaces a redacted error snapshot.
      services.run = async () => {
        throw new Error('boom token=supersecret');
      };
      const failing = await fetch(`${gui.url}/api/run`, {
        method: 'POST',
        headers: mutationHeaders,
        body: JSON.stringify(request),
      });
      expect(failing.status).toBe(202);
      await new Promise((resolve) => setTimeout(resolve, 10));
      const failed = (await fetch(`${gui.url}/api/run`).then((response) => response.json())) as {
        status: string;
        error?: string;
      };
      expect(failed.status).toBe('failed');
      expect(failed.error).toContain('boom');
      expect(failed.error).not.toContain('supersecret');
    } finally {
      await gui.close();
    }
  });
});

function fakeServices(): GuiServices & { runRequests: GuiRunRequest[] } {
  const runRequests: GuiRunRequest[] = [];
  return {
    runRequests,
    async bootstrap() {
      return {
        root: '/fixture',
        config: defaultConfig(),
        doctor: [{ status: 'pass', label: 'Node.js', detail: 'v20' }],
        reports: [],
      };
    },
    async run(runRequest, _signal, logger) {
      runRequests.push(runRequest);
      logger.info('Dry run started');
      return {
        dryRun: true,
        report: {
          runId: 'run-test',
          task: runRequest.task,
          status: 'quality-gates-not-met',
          startedAt: new Date(0).toISOString(),
          finishedAt: new Date(0).toISOString(),
          durationMs: 0,
          baseCommit: 'abc',
          worktreePath: 'not-created (dry-run)',
          cycles: 0,
          roles: [],
          providers: [],
          diff: { filesChanged: 0, insertions: 0, deletions: 0, changedFiles: [] },
          tests: { passed: true, commands: [] },
          reviews: [],
          acceptanceCriteria: [],
          acceptanceCriteriaSatisfied: [],
          remainingIssues: [],
          securityWarnings: [],
          recommendedNextAction: 'Run for real',
          noCommitPerformed: true,
          noPushPerformed: true,
        },
      };
    },
    async report() {
      return '# report';
    },
  };
}
