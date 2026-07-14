import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises';
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
    expect(await gitVersion(process.cwd())).toBeTruthy();
    expect(await isGitRepository(process.cwd())).toBe(true);
    expect(await repositoryRoot(process.cwd())).toBe(process.cwd());
    expect(await hasCommits(process.cwd())).toBe(false);
    expect(await supportsWorktrees(process.cwd())).toBe(true);
    const checks = await runDoctor(process.cwd());
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
    expect((await new ClaudeProvider('/definitely/missing').checkAvailability()).installed).toBe(
      false,
    );
    expect((await new CodexProvider('/definitely/missing').checkAvailability()).installed).toBe(
      false,
    );
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
