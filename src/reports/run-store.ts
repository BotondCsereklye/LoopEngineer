import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DATA_DIR_NAME, RUNS_DIR_NAME } from '../config/defaults.js';
import { redactDeep, redactSecrets } from '../security/secret-redactor.js';

export interface RunStore {
  path: string;
  writeJson(name: string, value: unknown): Promise<void>;
  writeText(name: string, value: string): Promise<void>;
  appendEvent(value: unknown): Promise<void>;
  readText(name: string): Promise<string>;
}

function safeName(name: string): string {
  const normalized = path.normalize(name);
  if (
    path.isAbsolute(name) ||
    normalized === '..' ||
    normalized.startsWith(`..${path.sep}`) ||
    normalized.length === 0
  ) {
    throw new Error(`Invalid run artifact: ${name}`);
  }
  return normalized;
}

export async function createRunStore(root: string, runId: string): Promise<RunStore> {
  const storePath = path.join(root, DATA_DIR_NAME, RUNS_DIR_NAME, runId);
  await mkdir(storePath, { recursive: true, mode: 0o700 });
  const file = (name: string) => path.join(storePath, safeName(name));
  return {
    path: storePath,
    async writeJson(name, value) {
      const target = file(name);
      await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      await writeFile(target, `${JSON.stringify(redactDeep(value), null, 2)}\n`, { mode: 0o600 });
    },
    async writeText(name, value) {
      const target = file(name);
      await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
      await writeFile(target, redactSecrets(value), { mode: 0o600 });
    },
    async appendEvent(value) {
      await appendFile(file('provider-events.jsonl'), `${JSON.stringify(redactDeep(value))}\n`, {
        mode: 0o600,
      });
    },
    async readText(name) {
      return readFile(file(name), 'utf8');
    },
  };
}
