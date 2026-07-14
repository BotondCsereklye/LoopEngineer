import { readFile } from 'node:fs/promises';
import { parse as parseYaml } from 'yaml';
import type { ZodError } from 'zod';
import { ConfigurationError } from '../domain/errors.js';
import { configSchema, type LoopEngineerConfig } from './schema.js';

/** Formats Zod issues as "path: message" lines pointing at the invalid field. */
export function formatConfigIssues(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? issue.path.join('.') : '(root)';
      return `  - ${path}: ${issue.message}`;
    })
    .join('\n');
}

/** Validates an already-parsed configuration object. */
export function validateConfig(raw: unknown, source: string): LoopEngineerConfig {
  const result = configSchema.safeParse(raw);
  if (!result.success) {
    throw new ConfigurationError(
      `Invalid configuration in ${source}:\n${formatConfigIssues(result.error)}`,
    );
  }
  return result.data;
}

/** Loads and validates a YAML configuration file. */
export async function loadConfig(filePath: string): Promise<LoopEngineerConfig> {
  let text: string;
  try {
    text = await readFile(filePath, 'utf8');
  } catch {
    throw new ConfigurationError(
      `Configuration file not found: ${filePath}. Run "loopeng init" to create one.`,
    );
  }

  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (error) {
    throw new ConfigurationError(
      `Configuration file is not valid YAML: ${filePath}`,
      error instanceof Error ? error.message : String(error),
    );
  }

  return validateConfig(raw, filePath);
}
