import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import { CONFIG_FILE_NAME } from '../config/defaults.js';
import { loadConfig } from '../config/loader.js';
import { ConfigurationError, exitCodeForError } from '../domain/errors.js';
import { EXIT_CODES } from '../domain/types.js';
import { isGitRepository, repositoryRoot } from '../git/repository.js';
import { createDefaultRegistry } from '../providers/registry.js';
import { consoleLogger } from '../logging/logger.js';
import { orchestrate } from '../workflow/orchestrator.js';
import { cleanManagedData } from './commands/clean.js';
import { runDoctor } from './commands/doctor.js';
import { initProject } from './commands/init.js';
import { listRunReports, readRunReport } from './commands/status.js';
import { renderDoctor, renderRunSummary } from './output/terminal.js';

export function createCli(): Command {
  const program = new Command()
    .name('loopeng')
    .description('Controlled local multi-agent development loops in isolated Git worktrees')
    .version('0.1.0')
    .showHelpAfterError();

  program
    .command('init')
    .description('Create a safe default configuration and runtime directories')
    .action(async () => {
      const result = await initProject(process.cwd());
      console.log(
        result.createdConfig
          ? `Created ${result.configPath}`
          : `Kept existing ${result.configPath}`,
      );
      console.log(`Runtime directory: ${result.dataPath}`);
    });

  program
    .command('doctor')
    .description('Check local prerequisites and provider CLIs')
    .action(async () => {
      console.log(renderDoctor(await runDoctor(process.cwd())));
    });

  program
    .command('run')
    .description('Run the controlled development workflow')
    .option('--task <text>', 'task description')
    .option('--task-file <path>', 'read the task from a file')
    .option('--config <path>', 'configuration file', CONFIG_FILE_NAME)
    .option('--dry-run', 'validate and preview without providers or filesystem changes')
    .action(
      async (flags: { task?: string; taskFile?: string; config: string; dryRun?: boolean }) => {
        if (Boolean(flags.task) === Boolean(flags.taskFile)) {
          throw new ConfigurationError('Provide exactly one of --task or --task-file');
        }
        const cwd = process.cwd();
        const task = flags.task ?? (await readFile(path.resolve(cwd, flags.taskFile!), 'utf8'));
        const config = await loadConfig(path.resolve(cwd, flags.config));
        const configuredRoot = path.resolve(cwd, config.project.root);
        if (!(await isGitRepository(configuredRoot)))
          throw new ConfigurationError('Project root is not a Git repository');
        const root = await repositoryRoot(configuredRoot);
        const controller = new AbortController();
        const abort = () => controller.abort();
        process.once('SIGINT', abort);
        process.once('SIGTERM', abort);
        try {
          const result = await orchestrate({
            task: task.trim(),
            repoRoot: root,
            config,
            registry: createDefaultRegistry(),
            dryRun: flags.dryRun,
            signal: controller.signal,
            logger: consoleLogger(),
          });
          console.log(renderRunSummary(result.report, result.reportPath));
          process.exitCode = result.dryRun ? 0 : EXIT_CODES[result.report.status];
        } finally {
          process.removeListener('SIGINT', abort);
          process.removeListener('SIGTERM', abort);
        }
      },
    );

  program
    .command('status')
    .description('List recent completed runs')
    .action(async () => {
      const reports = await listRunReports(process.cwd());
      if (reports.length === 0) return console.log('No completed runs found.');
      for (const report of reports)
        console.log(`${report.runId}\t${report.status}\t${report.task}`);
    });

  program
    .command('report <run-id>')
    .description('Print a run Markdown report')
    .action(async (runId: string) => {
      console.log(await readRunReport(process.cwd(), runId));
    });

  program
    .command('clean')
    .description('Remove only managed worktrees that are safe to delete')
    .option('--force', 'remove dirty managed worktrees')
    .action(async (flags: { force?: boolean }) => {
      const root = (await isGitRepository(process.cwd()))
        ? await repositoryRoot(process.cwd())
        : process.cwd();
      const result = await cleanManagedData(root, Boolean(flags.force));
      for (const message of result.messages) console.log(message);
      console.log(`Removed: ${result.removed}; skipped: ${result.skipped}`);
    });

  return program;
}

export async function runCli(argv = process.argv): Promise<void> {
  try {
    await createCli().parseAsync(argv);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = exitCodeForError(error);
  }
}
