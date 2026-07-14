/** Deterministic, human-diffable serialization for stored handoffs. */
export function serializeHandoff(value: unknown): string {
  return JSON.stringify(value, null, 2) + '\n';
}

/** Compact serialization for embedding a handoff into a prompt. */
export function serializeForPrompt(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
