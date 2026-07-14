import { finalDecisionSchema } from '../handoff/schemas.js';
import { rolePrompt } from './templates.js';

export const finalJudgeRole = {
  name: 'final_judge' as const,
  outputSchemaName: 'FinalDecision',
  schema: finalDecisionSchema,
  prompt: (task: string, context: Record<string, unknown>) =>
    rolePrompt('final_judge', task, context),
};
