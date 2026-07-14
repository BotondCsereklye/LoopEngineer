import { runProcess } from '../execution/process-runner.js';
import { InternalError } from '../domain/errors.js';

const GIT_TIMEOUT_MS = 60_000;

export interface GitCommandResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** Runs a git command without a shell. Never destructive by itself. */
export async function git(args: string[], cwd: string): Promise<GitCommandResult> {
  const result = await runProcess({
    command: 'git',
    args,
    cwd,
    timeoutMs: GIT_TIMEOUT_MS,
  });
  return { exitCode: result.exitCode, stdout: result.stdout, stderr: result.stderr };
}

async function gitOrThrow(args: string[], cwd: string): Promise<string> {
  const result = await git(args, cwd);
  if (result.exitCode !== 0) {
    throw new InternalError(`git ${args.join(' ')} failed`, result.stderr.trim());
  }
  return result.stdout.trim();
}

export async function gitVersion(cwd: string): Promise<string | undefined> {
  const result = await git(['--version'], cwd);
  if (result.exitCode !== 0) return undefined;
  return result.stdout.trim().replace(/^git version\s*/, '');
}

export async function isGitRepository(cwd: string): Promise<boolean> {
  const result = await git(['rev-parse', '--is-inside-work-tree'], cwd);
  return result.exitCode === 0 && result.stdout.trim() === 'true';
}

export async function repositoryRoot(cwd: string): Promise<string> {
  return gitOrThrow(['rev-parse', '--show-toplevel'], cwd);
}

export async function currentCommit(cwd: string): Promise<string> {
  return gitOrThrow(['rev-parse', 'HEAD'], cwd);
}

export async function currentBranch(cwd: string): Promise<string> {
  return gitOrThrow(['rev-parse', '--abbrev-ref', 'HEAD'], cwd);
}

export async function hasCommits(cwd: string): Promise<boolean> {
  const result = await git(['rev-parse', 'HEAD'], cwd);
  return result.exitCode === 0;
}

export async function supportsWorktrees(cwd: string): Promise<boolean> {
  const result = await git(['worktree', 'list'], cwd);
  return result.exitCode === 0;
}
