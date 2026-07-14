import { repositoryAnalysisSchema } from '../handoff/schemas.js';
import { rolePrompt } from './templates.js';

export const analystRole = {
  name: 'analyst' as const,
  outputSchemaName: 'RepositoryAnalysis',
  schema: repositoryAnalysisSchema,
  prompt: (task: string, context: Record<string, unknown>) => rolePrompt('analyst', task, context),
};
