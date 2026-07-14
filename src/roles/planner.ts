import { implementationPlanSchema } from '../handoff/schemas.js';
import { rolePrompt } from './templates.js';

export const plannerRole = {
  name: 'planner' as const,
  outputSchemaName: 'ImplementationPlan',
  schema: implementationPlanSchema,
  prompt: (task: string, context: Record<string, unknown>) => rolePrompt('planner', task, context),
};
