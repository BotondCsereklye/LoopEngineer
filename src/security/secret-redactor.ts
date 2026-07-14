const REDACTED = '[REDACTED]';

interface RedactionRule {
  name: string;
  pattern: RegExp;
  replacement: string;
}

/**
 * Best-effort detection of obvious secrets in logs and reports.
 * This is defense in depth, not a guarantee — documented in docs/security.md.
 */
const RULES: RedactionRule[] = [
  {
    name: 'private-key-block',
    pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
    replacement: REDACTED,
  },
  {
    name: 'known-token-prefixes',
    // OpenAI, Anthropic, GitHub, Slack, Stripe, npm, AWS access keys, Google API keys.
    pattern:
      /\b(sk-ant-[A-Za-z0-9_-]{8,}|sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{10,}|npm_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z_-]{35})\b/g,
    replacement: REDACTED,
  },
  {
    name: 'authorization-header',
    pattern: /\b(authorization\s*[:=]\s*)("?)(bearer|basic|token)?\s*[A-Za-z0-9._~+/=-]{8,}\2/gi,
    replacement: `$1${REDACTED}`,
  },
  {
    name: 'bearer-token',
    pattern: /\b(bearer\s+)[A-Za-z0-9._~+/=-]{8,}/gi,
    replacement: `$1${REDACTED}`,
  },
  {
    name: 'assignment',
    // password=..., API_KEY: "...", secret := ..., token = '...'
    pattern:
      /\b([A-Za-z0-9_.-]*(?:password|passwd|pwd|secret|token|api[_-]?key|access[_-]?key|private[_-]?key|credential)[A-Za-z0-9_.-]*\s*[:=]\s*)(["']?)[^\s"']{4,}\2/gi,
    replacement: `$1${REDACTED}`,
  },
];

/** Redacts obvious secrets from arbitrary text before it is stored or shown. */
export function redactSecrets(text: string): string {
  let result = text;
  for (const rule of RULES) {
    result = result.replace(rule.pattern, rule.replacement);
  }
  return result;
}

/** Applies redaction to every string found in a JSON-serializable value. */
export function redactDeep<T>(value: T): T {
  if (typeof value === 'string') {
    return redactSecrets(value) as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => redactDeep(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = redactDeep(val);
    }
    return out as unknown as T;
  }
  return value;
}
