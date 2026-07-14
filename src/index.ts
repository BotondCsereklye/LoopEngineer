#!/usr/bin/env node
import { runCli } from './cli/app.js';

export { createCli, runCli } from './cli/app.js';
export { orchestrate } from './workflow/orchestrator.js';
export type { AgentProvider, AgentRequest, AgentResponse } from './providers/provider.js';

await runCli();
