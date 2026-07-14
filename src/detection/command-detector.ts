import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { DetectedCommands } from '../config/defaults.js';

/**
 * Detects likely install/build/test/lint/typecheck commands. Detection is a
 * SUGGESTION written into the config by `loopeng init` — only commands that
 * end up in the validated config are ever executed.
 */
export async function detectCommands(root: string): Promise<DetectedCommands> {
  if (existsSync(path.join(root, 'package.json'))) {
    return detectNodeCommands(root);
  }
  if (existsSync(path.join(root, 'Cargo.toml'))) {
    return { build: 'cargo build', test: 'cargo test' };
  }
  if (existsSync(path.join(root, 'go.mod'))) {
    return { build: 'go build ./...', test: 'go test ./...' };
  }
  if (
    existsSync(path.join(root, 'pyproject.toml')) ||
    existsSync(path.join(root, 'requirements.txt'))
  ) {
    return { test: 'pytest' };
  }
  return {};
}

async function detectNodeCommands(root: string): Promise<DetectedCommands> {
  let scripts: Record<string, string> = {};
  try {
    const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    scripts = pkg.scripts ?? {};
  } catch {
    return {};
  }

  const packageManager = existsSync(path.join(root, 'pnpm-lock.yaml'))
    ? 'pnpm'
    : existsSync(path.join(root, 'yarn.lock'))
      ? 'yarn'
      : 'npm';

  const runScript = (name: string): string =>
    packageManager === 'npm' ? `npm run ${name}` : `${packageManager} run ${name}`;

  const detected: DetectedCommands = {
    install: packageManager === 'npm' ? 'npm ci' : `${packageManager} install`,
  };
  if (scripts.build) detected.build = runScript('build');
  if (scripts.test)
    detected.test = packageManager === 'npm' ? 'npm test' : `${packageManager} test`;
  if (scripts.lint) detected.lint = runScript('lint');
  if (scripts.typecheck) detected.typecheck = runScript('typecheck');
  return detected;
}
