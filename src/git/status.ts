import { git } from './repository.js';

export interface RepoStatus {
  clean: boolean;
  entries: StatusEntry[];
}

export interface StatusEntry {
  state: string;
  file: string;
}

/** Parses `git status --porcelain`. Read-only. */
export async function repoStatus(cwd: string): Promise<RepoStatus> {
  const result = await git(['status', '--porcelain'], cwd);
  const lines = result.stdout.split('\n').filter((line) => line.trim().length > 0);
  const entries = lines.map((line) => ({
    state: line.slice(0, 2).trim(),
    file: line.slice(3).trim(),
  }));
  return { clean: entries.length === 0, entries };
}

export async function hasUncommittedChanges(cwd: string): Promise<boolean> {
  const status = await repoStatus(cwd);
  return !status.clean;
}
