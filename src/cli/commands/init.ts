import { access, appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { constants, existsSync } from 'node:fs';
import path from 'node:path';
import {
  CACHE_DIR_NAME,
  CONFIG_FILE_NAME,
  DATA_DIR_NAME,
  RUNS_DIR_NAME,
  TEMPLATES_DIR_NAME,
  WORKTREES_DIR_NAME,
  renderDefaultConfigYaml,
} from '../../config/defaults.js';
import { detectCommands } from '../../detection/command-detector.js';

export interface InitResult {
  createdConfig: boolean;
  configPath: string;
  dataPath: string;
}

export async function initProject(root: string): Promise<InitResult> {
  await access(root, constants.W_OK);
  const configPath = path.join(root, CONFIG_FILE_NAME);
  const dataPath = path.join(root, DATA_DIR_NAME);
  const createdConfig = !existsSync(configPath);
  if (createdConfig) {
    await writeFile(configPath, renderDefaultConfigYaml(await detectCommands(root)), {
      flag: 'wx',
    });
  }

  for (const directory of [RUNS_DIR_NAME, WORKTREES_DIR_NAME, CACHE_DIR_NAME, TEMPLATES_DIR_NAME]) {
    await mkdir(path.join(dataPath, directory), { recursive: true, mode: 0o700 });
  }
  await ensureRuntimeIgnored(root);
  return { createdConfig, configPath, dataPath };
}

async function ensureRuntimeIgnored(root: string): Promise<void> {
  const ignorePath = path.join(root, '.gitignore');
  const current = existsSync(ignorePath) ? await readFile(ignorePath, 'utf8') : '';
  const lines = current.split(/\r?\n/).map((line) => line.trim());
  if (lines.includes(`${DATA_DIR_NAME}/`)) return;
  const separator = current.length > 0 && !current.endsWith('\n') ? '\n' : '';
  await appendFile(
    ignorePath,
    `${separator}\n# Loop Engineer runtime data\n${DATA_DIR_NAME}/\n`,
    'utf8',
  );
}
