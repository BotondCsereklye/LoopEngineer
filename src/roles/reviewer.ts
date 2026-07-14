import { reviewResultSchema } from '../handoff/schemas.js';
import { rolePrompt } from './templates.js';

export const reviewerRole = {
  name: 'reviewer' as const,
  outputSchemaName: 'ReviewResult',
  schema: reviewResultSchema,
  prompt: (task: string, context: Record<string, unknown>) => rolePrompt('reviewer', task, context),
};
