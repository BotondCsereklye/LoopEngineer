import { z } from 'zod';
import { PERMISSION_MODES, PROVIDER_IDS, SEVERITIES } from '../domain/types.js';

const providerId = z.enum(PROVIDER_IDS);
const permissionMode = z.enum(PERMISSION_MODES);
const severity = z.enum(SEVERITIES);

const roleConfigSchema = z
  .object({
    provider: providerId,
    model: z.string().min(1).default('default'),
    permissions: permissionMode,
  })
  .strict();

export const configSchema = z
  .object({
    version: z.literal(1),

    project: z
      .object({
        root: z.string().min(1).default('.'),
        default_branch: z.string().min(1).default('main'),
      })
      .strict()
      .default({ root: '.', default_branch: 'main' }),

    workflow: z
      .object({
        name: z.string().min(1).default('feature-development'),
        max_cycles: z.number().int().min(1).max(20).default(3),
        max_runtime_minutes: z
          .number()
          .int()
          .min(1)
          .max(24 * 60)
          .default(60),
        stop_on_no_progress: z.boolean().default(true),
        require_human_approval_before_apply: z.boolean().default(false),
      })
      .strict()
      .default({}),

    roles: z
      .object({
        analyst: roleConfigSchema,
        planner: roleConfigSchema,
        implementer: roleConfigSchema,
        reviewer: roleConfigSchema,
        tester: roleConfigSchema,
        fixer: roleConfigSchema,
        final_judge: roleConfigSchema,
      })
      .strict(),

    quality_gates: z
      .object({
        require_tests_pass: z.boolean().default(true),
        require_clean_review: z.boolean().default(true),
        block_severities: z.array(severity).min(1).default(['critical', 'high']),
      })
      .strict()
      .default({}),

    commands: z
      .object({
        install: z.string().default(''),
        build: z.string().default(''),
        test: z.string().default(''),
        lint: z.string().default(''),
        typecheck: z.string().default(''),
      })
      .strict()
      .default({}),

    security: z
      .object({
        network_access: z.boolean().default(false),
        allow_package_install: z.boolean().default(false),
        allow_commit: z.boolean().default(false),
        allow_push: z.boolean().default(false),
        redact_secrets: z.boolean().default(true),
      })
      .strict()
      .default({}),
  })
  .strict()
  .superRefine((config, ctx) => {
    // Read/write expectations per role are part of the security model.
    const readOnlyRoles = ['analyst', 'planner', 'reviewer', 'final_judge'] as const;
    for (const role of readOnlyRoles) {
      if (config.roles[role].permissions !== 'read-only') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['roles', role, 'permissions'],
          message: `Role "${role}" must use "read-only" permissions`,
        });
      }
    }
    for (const role of ['implementer', 'fixer'] as const) {
      if (config.roles[role].permissions !== 'workspace-write') {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['roles', role, 'permissions'],
          message: `Role "${role}" must use "workspace-write" permissions`,
        });
      }
    }
    if (config.roles.tester.provider !== 'local' && config.roles.tester.provider !== 'fake') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['roles', 'tester', 'provider'],
        message: 'The tester role is not an LLM; it must use the "local" provider',
      });
    }
    if (config.roles.tester.permissions !== 'predefined-commands') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['roles', 'tester', 'permissions'],
        message: 'Role "tester" must use "predefined-commands" permissions',
      });
    }
  });

export type LoopEngineerConfig = z.output<typeof configSchema>;
export type RoleConfig = z.output<typeof roleConfigSchema>;
