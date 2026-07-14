import type { PermissionMode, RoleName } from '../domain/types.js';
import { SecurityViolationError } from '../domain/errors.js';

export interface PermissionProfile {
  mode: PermissionMode;
  mayWriteFiles: boolean;
  mayRunArbitraryTools: boolean;
  description: string;
}

const PROFILES: Record<PermissionMode, PermissionProfile> = {
  'read-only': {
    mode: 'read-only',
    mayWriteFiles: false,
    mayRunArbitraryTools: false,
    description: 'May read the workspace. No file changes, no commits, no push, no installs.',
  },
  'workspace-write': {
    mode: 'workspace-write',
    mayWriteFiles: true,
    mayRunArbitraryTools: false,
    description:
      'May write files inside the isolated worktree only. No commits, no push, network off by default.',
  },
  'predefined-commands': {
    mode: 'predefined-commands',
    mayWriteFiles: false,
    mayRunArbitraryTools: false,
    description:
      'May execute only the exact commands configured under "commands". No shell chaining, pipes, curl, wget or sudo.',
  },
};

export function permissionProfile(mode: PermissionMode): PermissionProfile {
  return PROFILES[mode];
}

/** Roles that must never receive write access, enforced independently of config. */
const READ_ONLY_ROLES: ReadonlySet<RoleName> = new Set([
  'analyst',
  'planner',
  'reviewer',
  'final_judge',
]);

/**
 * Last line of defense: even if a config slipped through validation,
 * the orchestrator re-asserts role/permission pairing before every call.
 */
export function assertRolePermission(role: RoleName, mode: PermissionMode): void {
  if (READ_ONLY_ROLES.has(role) && mode !== 'read-only') {
    throw new SecurityViolationError(
      `Security violation: role "${role}" requested "${mode}" but is restricted to read-only`,
    );
  }
  if ((role === 'implementer' || role === 'fixer') && mode !== 'workspace-write') {
    throw new SecurityViolationError(
      `Security violation: role "${role}" must run with workspace-write inside the worktree`,
    );
  }
  if (role === 'tester' && mode !== 'predefined-commands') {
    throw new SecurityViolationError(
      'Security violation: the tester role may only run predefined commands',
    );
  }
}
