import { chmod, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { runDoctor } from '../../src/cli/commands/doctor.js';
import { listRunReports, readRunReport } from '../../src/cli/commands/status.js';
import { renderDoctor, renderRunSummary } from '../../src/cli/output/terminal.js';
import { loadConfig } from '../../src/config/loader.js';
import { renderDefaultConfigYaml } from '../../src/config/defaults.js';
import { detectCommands } from '../../src/detection/command-detector.js';
import { detectProject } from '../../src/detection/project-detector.js';
import { exitCodeForError, statusForError, ConfigurationError } from '../../src/domain/errors.js';
import { CancellationController } from '../../src/execution/cancellation.js';
import { Deadline } from '../../src/execution/timeout.js';
import {
  git,
  gitVersion,
  hasCommits,
  isGitRepository,
  repositoryRoot,
  supportsWorktrees,
} from '../../src/git/repository.js';
import { serializeForPrompt, serializeHandoff } from '../../src/handoff/serializer.js';
import { ClaudeProvider } from '../../src/providers/claude/adapter.js';
import { parseClaudeOutput } from '../../src/providers/claude/parser.js';
import { CodexProvider } from '../../src/providers/codex/adapter.js';
import { parseCodexOutput } from '../../src/providers/codex/parser.js';
import { permissionProfile, assertRolePermission } from '../../src/security/permissions.js';
import { isProviderUnavailableMessage, runStructuredRole } from '../../src/roles/common.js';
import { ProviderUnavailableError } from '../../src/domain/errors.js';
import { finalDecisionSchema } from '../../src/handoff/schemas.js';
import type { AgentProvider } from '../../src/providers/provider.js';
import type { RunReport } from '../../src/reports/types.js';

describe('utility modules', () => {
  it('loads YAML, detects projects and commands', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'loopeng-utils-'));
    await writeFile(
      path.join(root, 'package.json'),
      JSON.stringify({
        devDependencies: { typescript: '1' },
        scripts: { build: 'tsc', lint: 'eslint .' },
      }),
      'utf8',
    );
    await writeFile(path.join(root, 'AGENTS.md'), 'rules', 'utf8');
    await writeFile(path.join(root, 'loop-engineer.yml'), renderDefaultConfigYaml(), 'utf8');
    expect((await loadConfig(path.join(root, 'loop-engineer.yml'))).version).toBe(1);
    expect(await detectProject(root)).toMatchObject({
      projectType: 'node-typescript',
      instructionFiles: ['AGENTS.md'],
    });
    expect(await detectCommands(root)).toMatchObject({
      install: 'npm ci',
      build: 'npm run build',
      lint: 'npm run lint',
    });
    await expect(loadConfig(path.join(root, 'missing.yml'))).rejects.toBeInstanceOf(
      ConfigurationError,
    );
    const empty = await mkdtemp(path.join(tmpdir(), 'loopeng-empty-'));
    expect(await detectProject(empty)).toMatchObject({ projectType: 'unknown', languages: [] });
    expect(await detectCommands(empty)).toEqual({});
    await writeFile(path.join(empty, 'Cargo.toml'), '[package]', 'utf8');
    expect(await detectCommands(empty)).toEqual({ build: 'cargo build', test: 'cargo test' });

    const goRoot = await mkdtemp(path.join(tmpdir(), 'loopeng-go-'));
    await writeFile(path.join(goRoot, 'go.mod'), 'module fixture', 'utf8');
    expect(await detectCommands(goRoot)).toEqual({
      build: 'go build ./...',
      test: 'go test ./...',
    });

    const pyRoot = await mkdtemp(path.join(tmpdir(), 'loopeng-py-'));
    await writeFile(path.join(pyRoot, 'pyproject.toml'), '[project]', 'utf8');
    expect(await detectCommands(pyRoot)).toEqual({ test: 'pytest' });

    const pnpmRoot = await mkdtemp(path.join(tmpdir(), 'loopeng-pnpm-'));
    await writeFile(
      path.join(pnpmRoot, 'package.json'),
      JSON.stringify({ scripts: { test: 'vitest', typecheck: 'tsc --noEmit' } }),
      'utf8',
    );
    await writeFile(path.join(pnpmRoot, 'pnpm-lock.yaml'), '', 'utf8');
    expect(await detectCommands(pnpmRoot)).toEqual({
      install: 'pnpm install',
      test: 'pnpm test',
      typecheck: 'pnpm run typecheck',
    });

    const yarnRoot = await mkdtemp(path.join(tmpdir(), 'loopeng-yarn-'));
    await writeFile(
      path.join(yarnRoot, 'package.json'),
      JSON.stringify({ scripts: { test: 'vitest' } }),
      'utf8',
    );
    await writeFile(path.join(yarnRoot, 'yarn.lock'), '', 'utf8');
    expect(await detectCommands(yarnRoot)).toEqual({ install: 'yarn install', test: 'yarn test' });

    const brokenRoot = await mkdtemp(path.join(tmpdir(), 'loopeng-broken-'));
    await writeFile(path.join(brokenRoot, 'package.json'), '{not json', 'utf8');
    expect(await detectCommands(brokenRoot)).toEqual({});
  });

  it('maps errors, deadlines, cancellation and permissions', () => {
    const error = new ConfigurationError('bad');
    expect(exitCodeForError(error)).toBe(2);
    expect(statusForError(error)).toBe('config-error');
    expect(exitCodeForError(new Error('x'))).toBe(5);
    expect(statusForError(new Error('x'))).toBe('internal-error');
    const deadline = new Deadline(new Date(0), 1);
    expect(deadline.remainingMs(new Date(30_000))).toBe(30_000);
    expect(deadline.exceeded(new Date(60_000))).toBe(true);
    const cancellation = new CancellationController();
    cancellation.attachToProcess();
    cancellation.attachToProcess();
    cancellation.abort('test');
    cancellation.detach();
    cancellation.detach();
    expect(cancellation.aborted).toBe(true);
    expect(permissionProfile('read-only').mayWriteFiles).toBe(false);
    expect(() => assertRolePermission('reviewer', 'workspace-write')).toThrow(/restricted/);
    expect(() => assertRolePermission('implementer', 'read-only')).toThrow(/workspace-write/);
    expect(() => assertRolePermission('tester', 'read-only')).toThrow(/predefined/);
  });

  it('serializes handoffs and parses provider output variants', () => {
    expect(serializeHandoff({ b: 1 })).toBe('{\n  "b": 1\n}\n');
    expect(serializeForPrompt({ a: true })).toContain('"a": true');
    expect(parseClaudeOutput('{"result":"done"}').text).toBe('done');
    expect(parseClaudeOutput('{"value":1}').structured).toEqual({ value: 1 });
    expect(parseClaudeOutput('plain').text).toBe('plain');
    expect(parseClaudeOutput('plain').isError).toBe(false);
    expect(
      parseClaudeOutput('{"is_error":true,"result":"You have hit your session limit"}').isError,
    ).toBe(true);
    expect(parseClaudeOutput('{"subtype":"error_during_execution","result":"x"}').isError).toBe(
      true,
    );
    const codex = [
      '{"msg":{"type":"agent_message","message":"one"}}',
      '{"type":"item.completed","item":{"type":"agent_message","text":"two"}}',
      '{"type":"agent_message","message":"three"}',
    ].join('\n');
    expect(parseCodexOutput(codex).text).toBe('three');
    expect(parseCodexOutput('{bad json\n{"type":"agent_message","text":"text-layout"}').text).toBe(
      'text-layout',
    );
    expect(
      parseCodexOutput(
        '{"type":"item.completed","item":{"item_type":"agent_message","text":"item-layout"}}',
      ).text,
    ).toBe('item-layout');
    expect(parseCodexOutput('plain').text).toBe('plain');
  });

  it('checks repository helpers and doctor output', async () => {
    // Fresh fixture repo: assertions must not depend on the host repository's state.
    const root = await realpath(await mkdtemp(path.join(tmpdir(), 'loopeng-repo-')));
    await git(['init'], root);
    await git(['config', 'user.email', 'test@example.com'], root);
    await git(['config', 'user.name', 'Test'], root);
    expect(await gitVersion(root)).toBeTruthy();
    expect(await isGitRepository(root)).toBe(true);
    expect(await repositoryRoot(root)).toBe(root);
    expect(await hasCommits(root)).toBe(false);
    await writeFile(path.join(root, 'README.md'), 'fixture', 'utf8');
    await git(['add', 'README.md'], root);
    await git(['commit', '-m', 'fixture'], root);
    expect(await hasCommits(root)).toBe(true);
    expect(await supportsWorktrees(root)).toBe(true);
    const checks = await runDoctor(root);
    expect(checks.some((check) => check.label === 'Node.js')).toBe(true);
    expect(renderDoctor(checks)).toContain('Loop Engineer Doctor');
  });
});

describe('provider adapters', () => {
  it('probes and runs fake official CLIs without a shell', async () => {
    const binary = await fakeCliBinary();
    const claude = new ClaudeProvider(binary);
    const codex = new CodexProvider(binary);
    expect((await claude.checkAvailability()).installed).toBe(true);
    expect((await codex.checkAvailability()).authenticated).toBe(true);
    const request = {
      role: 'analyst' as const,
      prompt: 'prompt',
      task: 'task',
      cwd: process.cwd(),
      permissionMode: 'read-only' as const,
      context: {},
      outputSchema: 'RepositoryAnalysis',
      timeoutMs: 2_000,
    };
    expect((await claude.run(request)).text).toBe('{"ok":true}');
    expect((await codex.run(request)).text).toBe('{"ok":true}');

    // Write roles map onto edit permissions / sandbox flags and explicit models.
    const writeRequest = {
      ...request,
      role: 'implementer' as const,
      permissionMode: 'workspace-write' as const,
      model: 'custom-model',
      effort: 'xhigh' as const,
    };
    const claudeWrite = await claude.run(writeRequest);
    expect(claudeWrite.sanitizedCommand).toContain('--permission-mode acceptEdits');
    expect(claudeWrite.sanitizedCommand).toContain('--model custom-model');
    expect(claudeWrite.sanitizedCommand).toContain('--effort xhigh');
    expect(claudeWrite.sanitizedCommand).not.toContain('Bash');
    const codexWrite = await codex.run(writeRequest);
    expect(codexWrite.sanitizedCommand).toContain('--sandbox workspace-write');
    expect(codexWrite.sanitizedCommand).toContain('--model custom-model');
    expect(codexWrite.sanitizedCommand).toContain('model_reasoning_effort="xhigh"');
    expect((await new ClaudeProvider('/definitely/missing').checkAvailability()).installed).toBe(
      false,
    );
    expect((await new CodexProvider('/definitely/missing').checkAvailability()).installed).toBe(
      false,
    );
  });

  it('classifies provider-signaled limits as unavailability, not invalid output', async () => {
    expect(isProviderUnavailableMessage("You've hit your session limit · resets 10:40pm")).toBe(
      true,
    );
    expect(isProviderUnavailableMessage('Please run /login to continue')).toBe(true);
    expect(isProviderUnavailableMessage('{"ok":true}')).toBe(false);

    const limited: AgentProvider = {
      id: 'claude',
      async checkAvailability() {
        return { installed: true, details: '' };
      },
      async run() {
        return {
          exitCode: 1,
          text: "You've hit your session limit · resets 10:40pm",
          stderr: '',
          durationMs: 1,
          provider: 'claude',
          sanitizedCommand: 'claude -p (elided)',
          timedOut: false,
          error: 'Claude CLI reported an error result',
        };
      },
    };
    await expect(
      runStructuredRole(
        {
          provider: limited,
          role: 'planner',
          roleConfig: { provider: 'claude', model: 'default', permissions: 'read-only' },
          prompt: 'p',
          cwd: process.cwd(),
          task: 't',
          context: {},
          outputSchema: 'FinalDecision',
          timeoutMs: 1_000,
        },
        finalDecisionSchema,
      ),
    ).rejects.toBeInstanceOf(ProviderUnavailableError);
  });
});

describe('status and output', () => {
  it('lists and reads stored reports', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'loopeng-status-'));
    const runId = 'run-20260714-184500-a3f8';
    const dir = path.join(root, '.loop-engineer', 'runs', runId);
    await import('node:fs/promises').then(({ mkdir }) => mkdir(dir, { recursive: true }));
    const report = minimalReport(runId);
    await writeFile(path.join(dir, 'report.json'), JSON.stringify(report), 'utf8');
    await writeFile(path.join(dir, 'report.md'), '# Stored', 'utf8');
    expect((await listRunReports(root))[0]?.runId).toBe(runId);
    expect(await readRunReport(root, runId)).toBe('# Stored');
    expect(renderRunSummary(report, '/report.md')).toContain('No commit or push');
    expect(renderRunSummary({ ...report, worktreePath: 'not-created (dry-run)' })).toContain(
      'Status: DRY RUN',
    );
    await expect(readRunReport(root, '../bad')).rejects.toThrow(/Invalid run ID/);
    expect(await readFile(path.join(dir, 'report.md'), 'utf8')).toBe('# Stored');
  });
});

async function fakeCliBinary(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'loopeng-provider-'));
  const binary = path.join(root, 'fake-cli');
  await writeFile(
    binary,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === '--version') console.log('fake-cli 1.0');
else if (args[0] === 'login') console.log('logged in');
else if (args.includes('--output-format')) console.log(JSON.stringify({ result: '{"ok":true}' }));
else console.log(JSON.stringify({ type: 'agent_message', message: '{"ok":true}' }));
`,
    'utf8',
  );
  await chmod(binary, 0o755);
  return binary;
}

function minimalReport(runId: string): RunReport {
  return {
    runId,
    task: 'Stored',
    status: 'ready-for-human-review',
    startedAt: new Date(0).toISOString(),
    finishedAt: new Date(1).toISOString(),
    durationMs: 1,
    baseCommit: 'abc',
    worktreePath: '/tmp/worktree',
    cycles: 1,
    roles: [],
    providers: [],
    diff: { filesChanged: 0, insertions: 0, deletions: 0, changedFiles: [] },
    tests: { passed: true, commands: [] },
    reviews: [],
    acceptanceCriteria: [],
    acceptanceCriteriaSatisfied: [],
    remainingIssues: [],
    securityWarnings: [],
    recommendedNextAction: 'Review',
    noCommitPerformed: true,
    noPushPerformed: true,
  };
}
