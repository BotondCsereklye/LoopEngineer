import { access, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { initProject } from '../../src/cli/commands/init.js';
import { cleanManagedData } from '../../src/cli/commands/clean.js';
import { git } from '../../src/git/repository.js';
import { createWorktree } from '../../src/git/worktree.js';

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
  });
});
