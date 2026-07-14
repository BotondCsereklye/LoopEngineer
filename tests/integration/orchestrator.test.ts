import { mkdtemp, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/config/defaults.js';
import {
  InternalError,
  ProviderOutputError,
  ProviderUnavailableError,
  UserAbortError,
} from '../../src/domain/errors.js';
import { git } from '../../src/git/repository.js';
import { orchestrate } from '../../src/workflow/orchestrator.js';
import type {
  AgentProvider,
  AgentRequest,
  AgentResponse,
  ProviderRegistry,
} from '../../src/providers/provider.js';

class FakeProvider implements AgentProvider {
  readonly id = 'fake';
  readonly roles: string[] = [];

  async checkAvailability() {
    return { installed: true, authenticated: true, details: 'fake provider' };
  }

  async run(request: AgentRequest): Promise<AgentResponse> {
    this.roles.push(request.role);
    if (request.role === 'implementer') {
      await writeFile(path.join(request.cwd, 'implemented.txt'), 'done\n', 'utf8');
    }
    const structured = handoffFor(request.role);
    return {
      exitCode: 0,
      text: JSON.stringify(structured),
      structured,
      stderr: '',
      durationMs: 1,
      provider: this.id,
      sanitizedCommand: 'fake',
      timedOut: false,
    };
  }
}

function handoffFor(role: string): unknown {
  if (role === 'analyst') {
    return {
      projectType: 'fixture',
      languages: ['Text'],
      frameworks: [],
      importantFiles: [],
      architectureSummary: 'fixture',
      testCommands: [],
      buildCommands: [],
      instructionFiles: [],
      risks: [],
      constraints: [],
    };
  }
  if (role === 'planner') {
    return {
      goal: 'Implement',
      summary: 'Plan',
      scope: ['implemented.txt'],
      outOfScope: [],
      acceptanceCriteria: ['File exists'],
      implementationSteps: ['Create file'],
      validationCommands: [],
      forbiddenChanges: [],
      risks: [],
    };
  }
  if (role === 'implementer' || role === 'fixer') {
    return {
      summary: 'Implemented',
      changedFiles: ['implemented.txt'],
      notes: [],
      deviationsFromPlan: [],
    };
  }
  if (role === 'reviewer') return { approved: true, summary: 'Clean', findings: [] };
  return {
    readyForHumanReview: true,
    summary: 'Ready',
    acceptanceCriteriaSatisfied: ['File exists'],
    remainingIssues: [],
    recommendedNextAction: 'Review diff',
  };
}

async function fixtureRepository(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'loopeng-repo-'));
  await git(['init'], root);
  await git(['config', 'user.email', 'test@example.com'], root);
  await git(['config', 'user.name', 'Test'], root);
  await writeFile(path.join(root, 'README.md'), '# Fixture\n', 'utf8');
  await git(['add', 'README.md'], root);
  await git(['commit', '-m', 'fixture'], root);
  return root;
}

describe('orchestrator', () => {
  it('completes a workflow with fake providers in an isolated worktree', async () => {
    const root = await fixtureRepository();
    const fake = new FakeProvider();
    const config = defaultConfig();
    for (const role of Object.keys(config.roles) as Array<keyof typeof config.roles>) {
      config.roles[role].provider = 'fake';
    }
    const registry: ProviderRegistry = new Map([['fake', fake]]);

    const result = await orchestrate({ task: 'Create fixture', repoRoot: root, config, registry });

    expect(result.report.status).toBe('ready-for-human-review');
    expect(result.report.diff.changedFiles).toContain('implemented.txt');
    expect(result.report.noCommitPerformed).toBe(true);
    expect(await readFile(path.join(result.report.worktreePath, 'implemented.txt'), 'utf8')).toBe(
      'done\n',
    );
    expect(fake.roles).toEqual(['analyst', 'planner', 'implementer', 'reviewer', 'final_judge']);
  });

  it('dry-run performs no filesystem or provider changes', async () => {
    const root = await fixtureRepository();
    const fake = new FakeProvider();
    const config = defaultConfig();
    const result = await orchestrate({
      task: 'Preview',
      repoRoot: root,
      config,
      registry: new Map([['fake', fake]]),
      dryRun: true,
    });

    expect(result.dryRun).toBe(true);
    expect(fake.roles).toEqual([]);
    expect(result.report.worktreePath).toBe('not-created (dry-run)');
  });

  it('runs one fixer cycle when review initially has a blocking finding', async () => {
    const root = await fixtureRepository();
    let reviews = 0;
    const fake = new ScriptedProvider(async (request) => {
      if (request.role === 'implementer')
        await writeFile(path.join(request.cwd, 'feature.txt'), 'broken\n');
      if (request.role === 'fixer')
        await writeFile(path.join(request.cwd, 'feature.txt'), 'fixed\n');
      if (request.role === 'reviewer') {
        reviews += 1;
        return reviews === 1
          ? {
              approved: false,
              summary: 'Broken',
              findings: [
                {
                  severity: 'high',
                  category: 'correctness',
                  file: 'feature.txt',
                  line: 1,
                  title: 'Broken',
                  description: 'Needs fix',
                  suggestedFix: 'Fix it',
                },
              ],
            }
          : { approved: true, summary: 'Clean', findings: [] };
      }
      return handoffFor(request.role);
    });
    const config = fakeConfig();

    const result = await orchestrate({
      task: 'Fix cycle',
      repoRoot: root,
      config,
      registry: new Map([['fake', fake]]),
    });

    expect(result.report.status).toBe('ready-for-human-review');
    expect(result.report.cycles).toBe(2);
    expect(fake.roles).toContain('fixer');
    expect(await readFile(path.join(result.report.worktreePath, 'feature.txt'), 'utf8')).toBe(
      'fixed\n',
    );
  });

  it('runs a fixer cycle after a failed tester result', async () => {
    const root = await fixtureRepository();
    let testRuns = 0;
    const fake = new ScriptedProvider(async (request) => {
      if (request.role === 'implementer')
        await writeFile(path.join(request.cwd, 'tested.txt'), 'first\n');
      if (request.role === 'fixer')
        await writeFile(path.join(request.cwd, 'tested.txt'), 'fixed\n');
      if (request.role === 'tester') {
        testRuns += 1;
        return {
          passed: testRuns > 1,
          commands: [
            {
              command: 'fake test',
              exitCode: testRuns > 1 ? 0 : 1,
              durationMs: 1,
              stdoutSummary: '',
              stderrSummary: '',
              blocked: false,
              blockedReason: '',
              timedOut: false,
            },
          ],
        };
      }
      return handoffFor(request.role);
    });
    const config = fakeConfig();
    config.commands.test = 'fake test';
    const result = await orchestrate({
      task: 'Test fix',
      repoRoot: root,
      config,
      registry: new Map([['fake', fake]]),
    });
    expect(result.report.status).toBe('ready-for-human-review');
    expect(result.report.cycles).toBe(2);
    expect(testRuns).toBe(2);
  });

  it('clamps a provider approval when maximum cycles leave blocking findings', async () => {
    const root = await fixtureRepository();
    const fake = new ScriptedProvider(async (request) =>
      request.role === 'reviewer'
        ? {
            approved: false,
            summary: 'Blocked',
            findings: [
              {
                severity: 'critical',
                category: 'security',
                file: 'x',
                line: null,
                title: 'Blocked',
                description: 'Unsafe',
                suggestedFix: 'Fix',
              },
            ],
          }
        : handoffFor(request.role),
    );
    const config = fakeConfig();
    config.workflow.max_cycles = 1;

    const result = await orchestrate({
      task: 'Blocked',
      repoRoot: root,
      config,
      registry: new Map([['fake', fake]]),
    });

    expect(result.report.status).toBe('quality-gates-not-met');
    expect(result.report.remainingIssues).toContain('blocking-review-findings');
    expect(fake.roles).not.toContain('fixer');
  });

  it('fails closed for unavailable, invalid and timed-out providers', async () => {
    const root = await fixtureRepository();
    const config = fakeConfig();
    const unavailable = new ScriptedProvider(async (request) => handoffFor(request.role), false);
    await expect(
      orchestrate({
        task: 'x',
        repoRoot: root,
        config,
        registry: new Map([['fake', unavailable]]),
      }),
    ).rejects.toBeInstanceOf(ProviderUnavailableError);

    const invalid = new ScriptedProvider(async () => 'not-json');
    await expect(
      orchestrate({ task: 'x', repoRoot: root, config, registry: new Map([['fake', invalid]]) }),
    ).rejects.toBeInstanceOf(ProviderOutputError);
    const runDirs = await readdir(path.join(root, '.loop-engineer', 'runs'));
    const rawFiles = await Promise.all(
      runDirs.map(async (runDir) =>
        readdir(path.join(root, '.loop-engineer', 'runs', runDir)).catch(() => []),
      ),
    );
    expect(rawFiles.flat()).toContain('raw-output-analyst-cycle-1.txt');

    const timeout = new ScriptedProvider(async (request) => handoffFor(request.role), true, true);
    await expect(
      orchestrate({ task: 'x', repoRoot: root, config, registry: new Map([['fake', timeout]]) }),
    ).rejects.toBeInstanceOf(InternalError);
  });

  it('honors cancellation before creating a run', async () => {
    const root = await fixtureRepository();
    const controller = new AbortController();
    controller.abort();
    await expect(
      orchestrate({
        task: 'x',
        repoRoot: root,
        config: fakeConfig(),
        registry: new Map([['fake', new FakeProvider()]]),
        signal: controller.signal,
      }),
    ).rejects.toBeInstanceOf(UserAbortError);
  });

  it('preserves existing changes in the main checkout', async () => {
    const root = await fixtureRepository();
    await writeFile(path.join(root, 'local-only.txt'), 'keep me\n', 'utf8');
    const result = await orchestrate({
      task: 'Preserve main',
      repoRoot: root,
      config: fakeConfig(),
      registry: new Map([['fake', new FakeProvider()]]),
    });
    expect(await readFile(path.join(root, 'local-only.txt'), 'utf8')).toBe('keep me\n');
    expect(result.report.worktreePath).not.toBe(root);
  });
});

class ScriptedProvider implements AgentProvider {
  readonly id = 'fake';
  readonly roles: string[] = [];
  constructor(
    private readonly handler: (request: AgentRequest) => Promise<unknown>,
    private readonly available = true,
    private readonly timeout = false,
  ) {}
  async checkAvailability() {
    return {
      installed: this.available,
      authenticated: true,
      details: this.available ? 'available' : 'missing',
    };
  }
  async run(request: AgentRequest): Promise<AgentResponse> {
    this.roles.push(request.role);
    const value = await this.handler(request);
    return {
      exitCode: 0,
      text: typeof value === 'string' ? value : JSON.stringify(value),
      structured: typeof value === 'string' ? undefined : value,
      stderr: '',
      durationMs: 1,
      provider: this.id,
      sanitizedCommand: 'fake',
      timedOut: this.timeout,
    };
  }
}

function fakeConfig() {
  const config = defaultConfig();
  for (const role of Object.keys(config.roles) as Array<keyof typeof config.roles>) {
    config.roles[role].provider = 'fake';
  }
  return config;
}
