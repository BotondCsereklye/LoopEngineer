import { createHash } from 'node:crypto';
import type { DiffStats } from '../domain/types.js';
import { git } from './repository.js';

export interface WorktreeDiff {
  patch: string;
  stats: DiffStats;
  /** Stable hash of the patch, used by the progress detector. */
  hash: string;
}

/**
 * Computes the full diff of an isolated worktree against its base commit,
 * including new (untracked) files. Staging happens only in the worktree's own
 * index — it is not a commit and never affects the user's repository.
 */
export async function worktreeDiff(
  worktreePath: string,
  baseCommit: string,
): Promise<WorktreeDiff> {
  await git(['add', '-A'], worktreePath);

  const patchResult = await git(['diff', '--cached', baseCommit], worktreePath);
  const numstatResult = await git(['diff', '--cached', '--numstat', baseCommit], worktreePath);

  const patch = patchResult.stdout;
  const stats = parseNumstat(numstatResult.stdout);
  const hash = createHash('sha256').update(patch).digest('hex');
  return { patch, stats, hash };
}

export function parseNumstat(numstat: string): DiffStats {
  const lines = numstat.split('\n').filter((line) => line.trim().length > 0);
  let insertions = 0;
  let deletions = 0;
  const changedFiles: string[] = [];
  for (const line of lines) {
    const [added, removed, ...fileParts] = line.split('\t');
    const file = fileParts.join('\t');
    if (!file) continue;
    changedFiles.push(file);
    // Binary files are reported as "-".
    if (added !== '-') insertions += Number.parseInt(added, 10) || 0;
    if (removed !== '-') deletions += Number.parseInt(removed, 10) || 0;
  }
  return { filesChanged: changedFiles.length, insertions, deletions, changedFiles };
}
