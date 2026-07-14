import { testResultSchema } from '../handoff/schemas.js';
import { rolePrompt } from './templates.js';

export const testerRole = {
  name: 'tester' as const,
  outputSchemaName: 'TestResult',
  schema: testResultSchema,
  prompt: (task: string, context: Record<string, unknown>) => rolePrompt('tester', task, context),
};
