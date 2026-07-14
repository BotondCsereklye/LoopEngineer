/**
 * Parses Codex CLI JSONL event output (`codex exec --json`).
 * The event shape has changed between Codex versions, so several known
 * layouts are checked; unknown lines are ignored rather than fatal.
 */
export function parseCodexOutput(stdout: string): { text: string } {
  const messages: string[] = [];

  for (const line of stdout.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) continue;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(trimmed) as Record<string, unknown>;
    } catch {
      continue;
    }
    const text = extractAgentMessage(event);
    if (text) messages.push(text);
  }

  if (messages.length > 0) {
    // The final agent message carries the structured handoff.
    return { text: messages[messages.length - 1] };
  }
  return { text: stdout.trim() };
}

function extractAgentMessage(event: Record<string, unknown>): string | undefined {
  // Layout A: { "msg": { "type": "agent_message", "message": "..." } }
  const msg = event.msg as Record<string, unknown> | undefined;
  if (msg?.type === 'agent_message' && typeof msg.message === 'string') {
    return msg.message;
  }
  // Layout B: { "type": "item.completed", "item": { "item_type"|"type": "agent_message", "text": "..." } }
  const item = event.item as Record<string, unknown> | undefined;
  if (item && (item.item_type === 'agent_message' || item.type === 'agent_message')) {
    if (typeof item.text === 'string') return item.text;
  }
  // Layout C: { "type": "agent_message", "message"|"text": "..." }
  if (event.type === 'agent_message') {
    if (typeof event.message === 'string') return event.message;
    if (typeof event.text === 'string') return event.text;
  }
  return undefined;
}
