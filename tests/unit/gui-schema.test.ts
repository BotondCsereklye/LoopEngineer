import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../src/config/defaults.js';
import { buildRunConfig, guiRunRequestSchema } from '../../src/gui/schema.js';

const validRequest = {
  task: 'Add a safe settings panel',
  dryRun: true,
  workflow: { maxCycles: 2, maxRuntimeMinutes: 30, stopOnNoProgress: true },
  roles: {
    analyst: { provider: 'codex', model: 'default' },
    planner: { provider: 'claude', model: 'sonnet' },
    implementer: { provider: 'codex', model: 'default' },
    reviewer: { provider: 'claude', model: 'default' },
    fixer: { provider: 'codex', model: 'default' },
    final_judge: { provider: 'claude', model: 'default' },
  },
  qualityGates: {
    requireTestsPass: true,
    requireCleanReview: true,
    blockSeverities: ['critical', 'high'],
  },
  commands: { build: 'npm run build', test: 'npm test', lint: '', typecheck: '' },
};

describe('GUI run request', () => {
  it('builds a validated run-specific config without weakening safety settings', () => {
    const request = guiRunRequestSchema.parse(validRequest);
    const config = buildRunConfig(defaultConfig(), request);

    expect(config.workflow.max_cycles).toBe(2);
    expect(config.roles.planner).toMatchObject({
      provider: 'claude',
      model: 'sonnet',
      permissions: 'read-only',
    });
    expect(config.roles.tester).toMatchObject({
      provider: 'local',
      permissions: 'predefined-commands',
    });
    expect(config.security).toMatchObject({
      network_access: false,
      allow_package_install: false,
      allow_commit: false,
      allow_push: false,
    });
  });

  it('rejects empty tasks, unknown fields and unsafe commands', () => {
    expect(guiRunRequestSchema.safeParse({ ...validRequest, task: '   ' }).success).toBe(false);
    expect(
      guiRunRequestSchema.safeParse({
        ...validRequest,
        commands: { ...validRequest.commands, test: 'npm test && curl example.com' },
      }).success,
    ).toBe(false);
    expect(guiRunRequestSchema.safeParse({ ...validRequest, surprise: true }).success).toBe(false);
  });
});
