import { access } from 'node:fs/promises';
import { constants, existsSync } from 'node:fs';
import path from 'node:path';
import { detectCommands } from '../../detection/command-detector.js';
import { runProcess } from '../../execution/process-runner.js';
import { gitVersion, isGitRepository, supportsWorktrees } from '../../git/repository.js';
import { repoStatus } from '../../git/status.js';
import { ClaudeProvider } from '../../providers/claude/adapter.js';
import { CodexProvider } from '../../providers/codex/adapter.js';

export interface DoctorCheck {
  status: 'pass' | 'warn' | 'fail';
  label: string;
  detail: string;
}

export async function runDoctor(root: string): Promise<DoctorCheck[]> {
  const checks: DoctorCheck[] = [];
  const major = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);
  checks.push({ status: major >= 20 ? 'pass' : 'fail', label: 'Node.js', detail: process.version });

  const version = await gitVersion(root);
  checks.push({ status: version ? 'pass' : 'fail', label: 'Git', detail: version ?? 'not found' });
  const repository = await isGitRepository(root);
  checks.push({
    status: repository ? 'pass' : 'fail',
    label: 'Git repository',
    detail: repository ? 'detected' : 'not detected',
  });

  const [claude, codex] = await Promise.all([
    new ClaudeProvider().checkAvailability(),
    new CodexProvider().checkAvailability(),
  ]);
  for (const [label, availability] of [
    ['Claude Code', claude],
    ['Codex CLI', codex],
  ] as const) {
    checks.push({
      status: availability.installed ? 'pass' : 'warn',
      label,
      detail: availability.installed
        ? (availability.version ?? availability.details)
        : 'not installed',
    });
    checks.push({
      status:
        availability.authenticated === false
          ? 'warn'
          : availability.authenticated
            ? 'pass'
            : 'warn',
      label: `${label} authentication`,
      detail:
        availability.authenticated === undefined
          ? 'status cannot be verified reliably'
          : availability.authenticated
            ? 'authenticated'
            : 'not authenticated',
    });
  }

  checks.push(await writableCheck(root));
  if (repository) {
    checks.push({
      status: (await supportsWorktrees(root)) ? 'pass' : 'fail',
      label: 'Git worktrees',
      detail: 'support check',
    });
    const status = await repoStatus(root);
    checks.push({
      status: status.clean ? 'pass' : 'warn',
      label: 'Working tree',
      detail: status.clean ? 'clean' : `${status.entries.length} uncommitted change(s)`,
    });
  }
  const commands = await detectCommands(root);
  const detected = [commands.build, commands.test, commands.lint, commands.typecheck].filter(
    Boolean,
  );
  checks.push({
    status: detected.length > 0 ? 'pass' : 'warn',
    label: 'Commands',
    detail: detected.join(', ') || 'none detected',
  });
  for (const file of ['AGENTS.md', 'CLAUDE.md']) {
    checks.push({
      status: existsSync(path.join(root, file)) ? 'pass' : 'warn',
      label: file,
      detail: existsSync(path.join(root, file)) ? 'detected' : 'not present',
    });
  }
  return checks;
}

async function writableCheck(root: string): Promise<DoctorCheck> {
  try {
    await access(root, constants.W_OK);
    return { status: 'pass', label: 'Write access', detail: 'available' };
  } catch {
    return { status: 'fail', label: 'Write access', detail: 'unavailable' };
  }
}

/** Kept as a tiny official-CLI probe helper for future CLI variations. */
export async function probeOfficialAuth(
  command: string,
  args: string[],
  cwd: string,
): Promise<boolean | undefined> {
  const result = await runProcess({ command, args, cwd, timeoutMs: 20_000 });
  if (result.exitCode === 127) return undefined;
  if (result.exitCode === 0) return true;
  return undefined;
}
