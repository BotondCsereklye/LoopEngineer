import { access, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { initProject } from '../../src/cli/commands/init.js';
import { cleanManagedData } from '../../src/cli/commands/clean.js';
import { probeOfficialAuth, runDoctor } from '../../src/cli/commands/doctor.js';
import { git } from '../../src/git/repository.js';
import {
  createWorktree,
  listManagedWorktrees,
  removeManagedWorktree,
} from '../../src/git/worktree.js';

async function repository(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'loopeng-cli-'));
  await git(['init'], root);
  await git(['config', 'user.email', 'test@example.com'], root);
  await git(['config', 'user.name', 'Test'], root);
  await writeFile(
    path.join(root, 'package.json'),
    JSON.stringify({ scripts: { test: 'vitest run' } }),
    'utf8',
  );
  await writeFile(path.join(root, 'README.md'), '# Fixture\n', 'utf8');
  await git(['add', '.'], root);
  await git(['commit', '-m', 'fixture'], root);
  return root;
}

describe('CLI command services', () => {
  it('initializes valid config, runtime directories and ignore rules idempotently', async () => {
    const root = await repository();
    const first = await initProject(root);
    const second = await initProject(root);

    expect(first.createdConfig).toBe(true);
    expect(second.createdConfig).toBe(false);
    expect(await readFile(path.join(root, 'loop-engineer.yml'), 'utf8')).toContain(
      'test: "npm test"',
    );
    expect(await readFile(path.join(root, '.gitignore'), 'utf8')).toContain('.loop-engineer/');
    await expect(access(path.join(root, '.loop-engineer', 'templates'))).resolves.toBeUndefined();
  });

  it('cleans only marked worktrees and refuses dirty managed worktrees', async () => {
    const root = await repository();
    const head = (await git(['rev-parse', 'HEAD'], root)).stdout.trim();
    const worktree = await createWorktree(root, 'run-test', head, new Date());
    await writeFile(path.join(worktree.path, 'dirty.txt'), 'keep', 'utf8');

    const result = await cleanManagedData(root, false);
    expect(result.removed).toBe(0);
    expect(result.skipped).toBe(1);
    await expect(access(path.join(worktree.path, 'dirty.txt'))).resolves.toBeUndefined();

    const forced = await cleanManagedData(root, true);
    expect(forced.removed).toBe(1);
    expect(forced.messages[0]).toContain('Removed run-test');
    expect(await listManagedWorktrees(root)).toEqual([]);
  });

  it('refuses foreign worktree paths and prunes vanished managed worktrees', async () => {
    const root = await repository();
    const head = (await git(['rev-parse', 'HEAD'], root)).stdout.trim();
    const worktree = await createWorktree(root, 'run-prune', head, new Date());

    const refusal = await removeManagedWorktree(root, {
      path: path.join(tmpdir(), 'unrelated-worktree'),
      meta: worktree.meta,
    });
    expect(refusal.removed).toBe(false);
    expect(refusal.reason).toContain('outside .loop-engineer/worktrees');

    // The directory disappeared out-of-band: cleanup must prune the stale registration.
    await rm(worktree.path, { recursive: true, force: true });
    const pruned = await removeManagedWorktree(root, worktree);
    expect(pruned.removed).toBe(true);
    expect(await listManagedWorktrees(root)).toEqual([]);
  });

  it('reports non-repository and dirty-repository doctor states', async () => {
    const plain = await mkdtemp(path.join(tmpdir(), 'loopeng-plain-'));
    const plainChecks = await runDoctor(plain);
    expect(plainChecks.find((check) => check.label === 'Git repository')?.status).toBe('fail');
    expect(plainChecks.some((check) => check.label === 'Git worktrees')).toBe(false);
    expect(plainChecks.find((check) => check.label === 'Commands')?.detail).toBe('none detected');
    expect(plainChecks.find((check) => check.label === 'AGENTS.md')?.status).toBe('warn');

    const root = await repository();
    await writeFile(path.join(root, 'AGENTS.md'), 'rules', 'utf8');
    const repoChecks = await runDoctor(root);
    expect(repoChecks.find((check) => check.label === 'Git repository')?.status).toBe('pass');
    expect(repoChecks.find((check) => check.label === 'Working tree')?.status).toBe('warn');
    expect(repoChecks.find((check) => check.label === 'AGENTS.md')?.status).toBe('pass');
    expect(repoChecks.find((check) => check.label === 'Commands')?.detail).toContain('npm test');
  });

  it('probes official auth status without guessing on failures', async () => {
    const cwd = process.cwd();
    expect(await probeOfficialAuth(process.execPath, ['-e', 'process.exit(0)'], cwd)).toBe(true);
    expect(
      await probeOfficialAuth(process.execPath, ['-e', 'process.exit(3)'], cwd),
    ).toBeUndefined();
    expect(await probeOfficialAuth('/definitely/missing-binary', [], cwd)).toBeUndefined();
  });
});
