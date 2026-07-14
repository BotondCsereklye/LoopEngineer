import { listManagedWorktrees, removeManagedWorktree } from '../../git/worktree.js';

export interface CleanResult {
  removed: number;
  skipped: number;
  messages: string[];
}

export async function cleanManagedData(root: string, force: boolean): Promise<CleanResult> {
  const worktrees = await listManagedWorktrees(root);
  let removed = 0;
  let skipped = 0;
  const messages: string[] = [];
  for (const worktree of worktrees) {
    const result = await removeManagedWorktree(root, worktree, { force });
    if (result.removed) {
      removed += 1;
      messages.push(`Removed ${worktree.meta.runId}`);
    } else {
      skipped += 1;
      messages.push(`Skipped ${worktree.meta.runId}: ${result.reason ?? 'unknown reason'}`);
    }
  }
  return { removed, skipped, messages };
}
