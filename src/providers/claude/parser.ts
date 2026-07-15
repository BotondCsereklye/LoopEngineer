/**
 * Parses Claude Code CLI headless output (`--output-format json`).
 * The CLI wraps the agent's final message in a result envelope; if the shape
 * ever changes we fall back to the raw text instead of failing hard.
 */
export interface ClaudeParsedOutput {
  text: string;
  structured?: unknown;
  /** true when the CLI envelope itself flags an error (e.g. limits, login). */
  isError: boolean;
}

export function parseClaudeOutput(stdout: string): ClaudeParsedOutput {
  const trimmed = stdout.trim();
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    const isError =
      parsed.is_error === true ||
      (typeof parsed.subtype === 'string' && parsed.subtype.startsWith('error'));
    if (typeof parsed.result === 'string') {
      return { text: parsed.result, structured: undefined, isError };
    }
    // Already a bare JSON object (some versions / configurations).
    return { text: trimmed, structured: parsed, isError };
  } catch {
    return { text: trimmed, isError: false };
  }
}
