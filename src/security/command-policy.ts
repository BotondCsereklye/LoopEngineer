/**
 * Command policy for the `predefined-commands` permission mode.
 *
 * Commands are executed WITHOUT a shell (argv arrays passed to spawn), so the
 * metacharacter check below is defense in depth: a command string containing
 * shell syntax would not do what its author expects and is rejected outright.
 */

export interface CommandValidation {
  allowed: boolean;
  reason?: string;
  argv?: string[];
}

/** Shell metacharacters that are never allowed in predefined commands. */
const SHELL_METACHARACTERS = /[;&|<>`$\\"'\n\r*?~#(){}[\]]/;

/** Binaries that predefined commands must never invoke. */
const DENIED_BINARIES = new Set([
  'curl',
  'wget',
  'sudo',
  'su',
  'doas',
  'rm',
  'rmdir',
  'dd',
  'mkfs',
  'chmod',
  'chown',
  'kill',
  'killall',
  'shutdown',
  'reboot',
  'eval',
  'exec',
  'sh',
  'bash',
  'zsh',
  'fish',
  'dash',
  'pwsh',
  'powershell',
  'cmd',
  'ssh',
  'scp',
  'nc',
  'netcat',
]);

/** Git subcommands that could destroy user data or publish changes. */
const DENIED_GIT_SUBCOMMANDS = new Set([
  'push',
  'reset',
  'clean',
  'rebase',
  'checkout',
  'restore',
  'branch',
  'tag',
  'remote',
  'fetch',
  'pull',
  'commit',
  'merge',
  'gc',
  'reflog',
  'filter-branch',
]);

/** Structural safety check, independent of any allow-list. */
export function checkCommandStructure(command: string): CommandValidation {
  const trimmed = command.trim();
  if (trimmed.length === 0) {
    return { allowed: false, reason: 'Empty command' };
  }
  const meta = trimmed.match(SHELL_METACHARACTERS);
  if (meta) {
    return {
      allowed: false,
      reason: `Shell metacharacter "${meta[0]}" is not allowed in predefined commands`,
    };
  }
  const argv = trimmed.split(/\s+/);
  const binary = basename(argv[0]);
  if (DENIED_BINARIES.has(binary.toLowerCase())) {
    return { allowed: false, reason: `Binary "${binary}" is denied by the command policy` };
  }
  if (binary.toLowerCase() === 'git') {
    const sub = (argv[1] ?? '').toLowerCase();
    if (DENIED_GIT_SUBCOMMANDS.has(sub)) {
      return {
        allowed: false,
        reason: `Git subcommand "git ${sub}" is denied by the command policy`,
      };
    }
  }
  return { allowed: true, argv };
}

/**
 * Full policy: the command must be structurally safe AND exactly match one of
 * the explicitly configured commands. Nothing from the repository (READMEs,
 * package scripts, agent output) can extend this list at runtime.
 */
export function validateCommand(command: string, allowlist: string[]): CommandValidation {
  const structural = checkCommandStructure(command);
  if (!structural.allowed) {
    return structural;
  }
  const normalized = command.trim();
  const allowed = allowlist.some((entry) => entry.trim() === normalized && entry.trim() !== '');
  if (!allowed) {
    return {
      allowed: false,
      reason: 'Command is not in the configured allow-list (see "commands" in loop-engineer.yml)',
    };
  }
  return structural;
}

function basename(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  return idx >= 0 ? normalized.slice(idx + 1) : normalized;
}
