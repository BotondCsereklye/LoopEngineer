import type { LoopEngineerConfig } from './schema.js';

export const CONFIG_FILE_NAME = 'loop-engineer.yml';
export const DATA_DIR_NAME = '.loop-engineer';
export const RUNS_DIR_NAME = 'runs';
export const WORKTREES_DIR_NAME = 'worktrees';
export const CACHE_DIR_NAME = 'cache';
export const TEMPLATES_DIR_NAME = 'templates';

/** Per-agent-call timeout. Conservative; the overall run budget is enforced separately. */
export const AGENT_TIMEOUT_MS = 15 * 60 * 1000;
/** Per predefined command (tests, lint, ...) timeout. */
export const COMMAND_TIMEOUT_MS = 10 * 60 * 1000;
/** Timeout for cheap availability probes such as `claude --version`. */
export const PROBE_TIMEOUT_MS = 20 * 1000;

export function defaultConfig(): LoopEngineerConfig {
  return {
    version: 1,
    project: { root: '.', default_branch: 'main' },
    workflow: {
      name: 'feature-development',
      max_cycles: 3,
      max_runtime_minutes: 60,
      stop_on_no_progress: true,
      require_human_approval_before_apply: false,
    },
    roles: {
      analyst: { provider: 'codex', model: 'default', permissions: 'read-only' },
      planner: { provider: 'claude', model: 'default', permissions: 'read-only' },
      implementer: { provider: 'codex', model: 'default', permissions: 'workspace-write' },
      reviewer: { provider: 'claude', model: 'default', permissions: 'read-only' },
      tester: { provider: 'local', model: 'default', permissions: 'predefined-commands' },
      fixer: { provider: 'codex', model: 'default', permissions: 'workspace-write' },
      final_judge: { provider: 'claude', model: 'default', permissions: 'read-only' },
    },
    quality_gates: {
      require_tests_pass: true,
      require_clean_review: true,
      block_severities: ['critical', 'high'],
    },
    commands: { install: '', build: '', test: '', lint: '', typecheck: '' },
    security: {
      network_access: false,
      allow_package_install: false,
      allow_commit: false,
      allow_push: false,
      redact_secrets: true,
    },
  };
}

export interface DetectedCommands {
  install?: string;
  build?: string;
  test?: string;
  lint?: string;
  typecheck?: string;
}

/** Renders the default YAML config written by `loopeng init`. */
export function renderDefaultConfigYaml(detected: DetectedCommands = {}): string {
  return `# Loop Engineer configuration
# Docs: docs/configuration.md
version: 1

project:
  root: .
  default_branch: main

workflow:
  name: feature-development
  max_cycles: 3
  max_runtime_minutes: 60
  stop_on_no_progress: true
  require_human_approval_before_apply: false

roles:
  analyst:
    provider: codex
    model: default
    permissions: read-only

  planner:
    provider: claude
    model: default
    permissions: read-only

  implementer:
    provider: codex
    model: default
    permissions: workspace-write

  reviewer:
    provider: claude
    model: default
    permissions: read-only

  tester:
    provider: local
    permissions: predefined-commands

  fixer:
    provider: codex
    model: default
    permissions: workspace-write

  final_judge:
    provider: claude
    model: default
    permissions: read-only

quality_gates:
  require_tests_pass: true
  require_clean_review: true
  block_severities:
    - critical
    - high

# Only these exact commands may be executed by the tester role.
commands:
  install: ${JSON.stringify(detected.install ?? '')}
  build: ${JSON.stringify(detected.build ?? '')}
  test: ${JSON.stringify(detected.test ?? '')}
  lint: ${JSON.stringify(detected.lint ?? '')}
  typecheck: ${JSON.stringify(detected.typecheck ?? '')}

security:
  network_access: false
  allow_package_install: false
  allow_commit: false
  allow_push: false
  redact_secrets: true
`;
}
