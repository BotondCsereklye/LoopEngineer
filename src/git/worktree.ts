import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { WorktreeError } from '../domain/errors.js';
import { DATA_DIR_NAME, WORKTREES_DIR_NAME } from '../config/defaults.js';
import { git } from './repository.js';
import { hasUncommittedChanges } from './status.js';

/**
 * Worktree isolation: all writing agents operate in a detached worktree under
 * .loop-engineer/worktrees/<run-id>/. The user's main working directory is
 * never touched. A sibling <run-id>.meta.json marks worktrees created by
 * Loop Engineer — `loopeng clean` only ever removes marked worktrees.
 */

export interface WorktreeMeta {
  runId: string;
  baseCommit: string;
  createdAt: string;
  tool: 'loop-engineer';
}

export interface Worktree {
  path: string;
  meta: WorktreeMeta;
}

export function worktreesDir(repoRoot: string): string {
  return path.join(repoRoot, DATA_DIR_NAME, WORKTREES_DIR_NAME);
}

function metaPath(repoRoot: string, runId: string): string {
  return path.join(worktreesDir(repoRoot), `${runId}.meta.json`);
}

export async function createWorktree(
  repoRoot: string,
  runId: string,
  baseCommit: string,
  now: Date,
): Promise<Worktree> {
  const dir = worktreesDir(repoRoot);
  await mkdir(dir, { recursive: true });
  const worktreePath = path.join(dir, runId);

  if (existsSync(worktreePath)) {
    throw new WorktreeError(`Worktree path already exists: ${worktreePath}`);
  }

  const result = await git(['worktree', 'add', '--detach', worktreePath, baseCommit], repoRoot);
  if (result.exitCode !== 0) {
    throw new WorktreeError('Failed to create isolated git worktree', result.stderr.trim());
  }

  const meta: WorktreeMeta = {
    runId,
    baseCommit,
    createdAt: now.toISOString(),
    tool: 'loop-engineer',
  };
  await writeFile(metaPath(repoRoot, runId), JSON.stringify(meta, null, 2), 'utf8');
  return { path: worktreePath, meta };
}

/** Lists only worktrees that carry a Loop Engineer marker file. */
export async function listManagedWorktrees(repoRoot: string): Promise<Worktree[]> {
  const dir = worktreesDir(repoRoot);
  if (!existsSync(dir)) return [];
  const entries = await readdir(dir);
  const result: Worktree[] = [];
  for (const entry of entries) {
    if (!entry.endsWith('.meta.json')) continue;
    try {
      const raw = await readFile(path.join(dir, entry), 'utf8');
      const meta = JSON.parse(raw) as WorktreeMeta;
      if (meta.tool !== 'loop-engineer') continue;
      const wtPath = path.join(dir, meta.runId);
      result.push({ path: wtPath, meta });
    } catch {
      // Unreadable marker: skip rather than guess.
    }
  }
  return result;
}

export interface RemoveResult {
  removed: boolean;
  reason?: string;
}

/**
 * Removes a managed worktree. Refuses when the worktree contains unsaved
 * changes unless `force` is set. Never touches unmanaged worktrees.
 */
export async function removeManagedWorktree(
  repoRoot: string,
  worktree: Worktree,
  options: { force?: boolean } = {},
): Promise<RemoveResult> {
  if (!worktree.path.startsWith(worktreesDir(repoRoot) + path.sep)) {
    return {
      removed: false,
      reason: 'Refusing to remove a worktree outside .loop-engineer/worktrees',
    };
  }

  if (existsSync(worktree.path)) {
    const dirty = await hasUncommittedChanges(worktree.path).catch(() => true);
    if (dirty && !options.force) {
      return {
        removed: false,
        reason: 'Worktree contains unsaved changes (use --force to remove anyway)',
      };
    }
    const result = await git(['worktree', 'remove', '--force', worktree.path], repoRoot);
    if (result.exitCode !== 0) {
      // Fall back to plain directory removal for already-broken worktrees.
      await rm(worktree.path, { recursive: true, force: true });
      await git(['worktree', 'prune'], repoRoot);
    }
  } else {
    await git(['worktree', 'prune'], repoRoot);
  }

  await rm(metaPath(repoRoot, worktree.meta.runId), { force: true });
  return { removed: true };
}
