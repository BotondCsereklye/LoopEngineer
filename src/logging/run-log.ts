import type { ProviderEvent } from '../domain/types.js';
import type { AgentResponse } from '../providers/provider.js';

export function providerEvent(
  response: AgentResponse,
  phase: ProviderEvent['phase'],
  cycle: number,
  role: ProviderEvent['role'],
  validation: string,
  now = new Date(),
): ProviderEvent {
  return {
    timestamp: now.toISOString(),
    phase,
    cycle,
    role,
    provider: response.provider,
    model: response.model,
    sanitizedCommand: response.sanitizedCommand,
    exitCode: response.exitCode,
    durationMs: response.durationMs,
    validation,
    outputExcerpt: response.text.slice(0, 1_000),
  };
}
