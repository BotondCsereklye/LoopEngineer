import { implementationSummarySchema } from '../handoff/schemas.js';
import { rolePrompt } from './templates.js';

export const implementerRole = {
  name: 'implementer' as const,
  outputSchemaName: 'ImplementationSummary',
  schema: implementationSummarySchema,
  prompt: (task: string, context: Record<string, unknown>) =>
    rolePrompt('implementer', task, context),
};
