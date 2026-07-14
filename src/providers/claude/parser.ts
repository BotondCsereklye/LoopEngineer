/**
 * Parses Claude Code CLI headless output (`--output-format json`).
 * The CLI wraps the agent's final message in a result envelope; if the shape
 * ever changes we fall back to the raw text instead of failing hard.
 */
export function parseClaudeOutput(stdout: string): { text: string; structured?: unknown } {
  const trimmed = stdout.trim();
  try {
    const parsed = JSON.parse(trimmed) as Record<string, unknown>;
    if (typeof parsed.result === 'string') {
      return { text: parsed.result, structured: undefined };
    }
    // Already a bare JSON object (some versions / configurations).
    return { text: trimmed, structured: parsed };
  } catch {
    return { text: trimmed };
  }
}
