import { z } from 'zod';
import { configSchema, type LoopEngineerConfig } from '../config/schema.js';
import { SEVERITIES } from '../domain/types.js';
import { isProviderSelectionSupported, REASONING_EFFORTS } from '../providers/catalog.js';
import { checkCommandStructure } from '../security/command-policy.js';

export const GUI_AGENT_ROLES = [
  'analyst',
  'planner',
  'implementer',
  'reviewer',
  'fixer',
  'final_judge',
] as const;

const roleSelectionSchema = z
  .object({
    provider: z.enum(['claude', 'codex']),
    model: z.string().trim().min(1).max(100).default('default'),
    effort: z.enum(REASONING_EFFORTS),
  })
  .strict()
  .superRefine((selection, context) => {
    if (!isProviderSelectionSupported(selection.provider, selection.model, selection.effort)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['model'],
        message: `Model "${selection.model}" with intelligence "${selection.effort}" is not supported by ${selection.provider}`,
      });
    }
  });

const commandSchema = z
  .string()
  .trim()
  .max(500)
  .superRefine((command, context) => {
    if (command === '') return;
    const validation = checkCommandStructure(command);
    if (!validation.allowed) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: validation.reason ?? 'Command is not allowed',
      });
    }
  });

export const guiRunRequestSchema = z
  .object({
    task: z.string().trim().min(1).max(20_000),
    dryRun: z.boolean(),
    workflow: z
      .object({
        maxCycles: z.number().int().min(1).max(20),
        maxRuntimeMinutes: z.number().int().min(1).max(1_440),
        stopOnNoProgress: z.boolean(),
      })
      .strict(),
    roles: z
      .object({
        analyst: roleSelectionSchema,
        planner: roleSelectionSchema,
        implementer: roleSelectionSchema,
        reviewer: roleSelectionSchema,
        fixer: roleSelectionSchema,
        final_judge: roleSelectionSchema,
      })
      .strict(),
    qualityGates: z
      .object({
        requireTestsPass: z.boolean(),
        requireCleanReview: z.boolean(),
        blockSeverities: z.array(z.enum(SEVERITIES)).min(1),
      })
      .strict(),
    commands: z
      .object({
        build: commandSchema,
        test: commandSchema,
        lint: commandSchema,
        typecheck: commandSchema,
      })
      .strict(),
  })
  .strict();

export type GuiRunRequest = z.output<typeof guiRunRequestSchema>;

export function buildRunConfig(
  baseConfig: LoopEngineerConfig,
  request: GuiRunRequest,
): LoopEngineerConfig {
  const roles = Object.fromEntries(
    GUI_AGENT_ROLES.map((role) => [
      role,
      {
        ...baseConfig.roles[role],
        provider: request.roles[role].provider,
        model: request.roles[role].model,
        effort: request.roles[role].effort,
      },
    ]),
  ) as Pick<LoopEngineerConfig['roles'], (typeof GUI_AGENT_ROLES)[number]>;

  return configSchema.parse({
    ...baseConfig,
    workflow: {
      ...baseConfig.workflow,
      max_cycles: request.workflow.maxCycles,
      max_runtime_minutes: request.workflow.maxRuntimeMinutes,
      stop_on_no_progress: request.workflow.stopOnNoProgress,
    },
    roles: {
      ...roles,
      tester: {
        ...baseConfig.roles.tester,
        provider: 'local',
        model: 'default',
        effort: undefined,
        permissions: 'predefined-commands',
      },
    },
    quality_gates: {
      require_tests_pass: request.qualityGates.requireTestsPass,
      require_clean_review: request.qualityGates.requireCleanReview,
      block_severities: request.qualityGates.blockSeverities,
    },
    commands: {
      ...baseConfig.commands,
      ...request.commands,
    },
    security: {
      ...baseConfig.security,
      network_access: false,
      allow_package_install: false,
      allow_commit: false,
      allow_push: false,
      redact_secrets: true,
    },
  });
}
