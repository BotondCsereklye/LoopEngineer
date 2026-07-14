import type { ZodType, ZodTypeDef } from 'zod';
import { ProviderOutputError } from '../domain/errors.js';

export type ValidationOutcome = 'valid' | 'repaired';

export interface ParsedHandoff<T> {
  value: T;
  outcome: ValidationOutcome;
}

/**
 * Parses agent output into a validated handoff.
 *
 * Policy (docs/workflow.md): try the raw output once; if it is not valid JSON
 * or fails the schema, apply exactly ONE safe mechanical repair pass and try
 * again. On a second failure abort in a controlled way — the raw output is
 * preserved by the caller for debugging and no values are ever invented.
 */
export function parseHandoff<T, TInput>(
  rawText: string,
  schema: ZodType<T, ZodTypeDef, TInput>,
  context: string,
): ParsedHandoff<T> {
  const direct = tryParse(rawText, schema);
  if (direct.success) {
    return { value: direct.value, outcome: 'valid' };
  }

  const repairedText = repairJsonText(rawText);
  const repaired = tryParse(repairedText, schema);
  if (repaired.success) {
    return { value: repaired.value, outcome: 'repaired' };
  }

  throw new ProviderOutputError(
    `${context}: provider did not return valid structured output (after one repair attempt)`,
    rawText,
    repaired.error,
  );
}

function tryParse<T, TInput>(
  text: string,
  schema: ZodType<T, ZodTypeDef, TInput>,
): { success: true; value: T } | { success: false; error: string } {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : 'JSON parse error' };
  }
  const result = schema.safeParse(json);
  if (!result.success) {
    const issues = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    return { success: false, error: issues };
  }
  return { success: true, value: result.data };
}

/**
 * Safe, purely mechanical repairs — no content is invented:
 * - strip markdown code fences
 * - extract the first balanced top-level JSON object
 * - remove trailing commas
 */
export function repairJsonText(text: string): string {
  let candidate = text.trim();

  const fenceMatch = candidate.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    candidate = fenceMatch[1].trim();
  }

  const extracted = extractFirstJsonObject(candidate);
  if (extracted !== undefined) {
    candidate = extracted;
  }

  candidate = candidate.replace(/,\s*([}\]])/g, '$1');
  return candidate;
}

function extractFirstJsonObject(text: string): string | undefined {
  const start = text.indexOf('{');
  if (start < 0) return undefined;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const char = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '"') {
        inString = false;
      }
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{') depth++;
    else if (char === '}') {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return undefined;
}
