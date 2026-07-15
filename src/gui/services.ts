import path from 'node:path';
import { runDoctor } from '../cli/commands/doctor.js';
import { listRunReports, readRunReport } from '../cli/commands/status.js';
import { loadConfig } from '../config/loader.js';
import { ConfigurationError } from '../domain/errors.js';
import { isGitRepository, repositoryRoot } from '../git/repository.js';
import { createDefaultRegistry } from '../providers/registry.js';
import { ProviderAuthManager } from '../providers/auth.js';
import { orchestrate } from '../workflow/orchestrator.js';
import { buildRunConfig } from './schema.js';
import type { GuiServices } from './server.js';
import { PROVIDER_MODEL_CATALOG } from '../providers/catalog.js';

export async function createDefaultGuiServices(
  cwd: string,
  configFile: string,
): Promise<GuiServices> {
  const configPath = path.resolve(cwd, configFile);
  const baseConfig = await loadConfig(configPath);
  const configuredRoot = path.resolve(cwd, baseConfig.project.root);
  if (!(await isGitRepository(configuredRoot))) {
    throw new ConfigurationError('Project root is not a Git repository');
  }
  const root = await repositoryRoot(configuredRoot);
  const auth = new ProviderAuthManager({ cwd: root });

  return {
    async bootstrap() {
      const [doctor, reports] = await Promise.all([runDoctor(root), listRunReports(root)]);
      return { root, config: baseConfig, doctor, reports, modelCatalog: PROVIDER_MODEL_CATALOG };
    },
    async run(request, signal, logger) {
      return orchestrate({
        task: request.task,
        repoRoot: root,
        config: buildRunConfig(baseConfig, request),
        registry: createDefaultRegistry(),
        dryRun: request.dryRun,
        signal,
        logger,
      });
    },
    report(runId) {
      return readRunReport(root, runId);
    },
    providerConnections() {
      return auth.connections();
    },
    connectProvider(provider) {
      return auth.connect(provider);
    },
    close() {
      return auth.close();
    },
  };
}
