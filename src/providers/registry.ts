import { ConfigurationError } from '../domain/errors.js';
import type { RoleName } from '../domain/types.js';
import type { LoopEngineerConfig } from '../config/schema.js';
import type { AgentProvider, ProviderRegistry } from './provider.js';
import { ClaudeProvider } from './claude/adapter.js';
import { CodexProvider } from './codex/adapter.js';
import { LocalShellProvider } from './local/shell-runner.js';

/** The default registry used by the real CLI. Tests inject fakes instead. */
export function createDefaultRegistry(): ProviderRegistry {
  return new Map<string, AgentProvider>([
    ['claude', new ClaudeProvider()],
    ['codex', new CodexProvider()],
    ['local', new LocalShellProvider()],
  ]);
}

/** Resolves the configured provider for a role, with a clear error if missing. */
export function providerForRole(
  registry: ProviderRegistry,
  config: LoopEngineerConfig,
  role: RoleName,
): AgentProvider {
  const providerId = config.roles[role].provider;
  const provider = registry.get(providerId);
  if (!provider) {
    throw new ConfigurationError(
      `No provider registered for "${providerId}" (role "${role}"). Available: ${[...registry.keys()].join(', ')}`,
    );
  }
  return provider;
}

/** Distinct providers actually used by the configured roles. */
export function usedProviders(
  registry: ProviderRegistry,
  config: LoopEngineerConfig,
): AgentProvider[] {
  const ids = new Set(Object.values(config.roles).map((role) => role.provider));
  return [...ids].map((id) => {
    const provider = registry.get(id);
    if (!provider) {
      throw new ConfigurationError(`No provider registered for "${id}"`);
    }
    return provider;
  });
}
