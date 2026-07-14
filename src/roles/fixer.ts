import { implementationSummarySchema } from '../handoff/schemas.js';
import { rolePrompt } from './templates.js';

export const fixerRole = {
  name: 'fixer' as const,
  outputSchemaName: 'ImplementationSummary',
  schema: implementationSummarySchema,
  prompt: (task: string, context: Record<string, unknown>) => rolePrompt('fixer', task, context),
};
