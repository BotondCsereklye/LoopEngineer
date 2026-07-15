import { ConfigurationError } from '../domain/errors.js';
import { runProcess } from '../execution/process-runner.js';
import { ClaudeProvider } from './claude/adapter.js';
import { CodexProvider } from './codex/adapter.js';

export const PROVIDER_IDS = ['claude', 'codex'] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];
export type ProviderConnectionState =
  'connected' | 'disconnected' | 'connecting' | 'unavailable' | 'unknown';

export interface ProviderConnection {
  id: ProviderId;
  label: string;
  installed: boolean;
  authenticated?: boolean;
  version?: string;
  state: ProviderConnectionState;
  details: string;
}

export interface ProviderConnectResult {
  provider: ProviderId;
  status: 'started' | 'already-connected' | 'in-progress';
}

export interface ProviderAuthManagerOptions {
  cwd: string;
  claudeBinary?: string;
  codexBinary?: string;
  timeoutMs?: number;
}

interface ActiveLogin {
  controller: AbortController;
  completion: Promise<void>;
}

const LABELS: Record<ProviderId, string> = {
  claude: 'Claude Code',
  codex: 'OpenAI Codex',
};

const LOGIN_ARGS: Record<ProviderId, string[]> = {
  claude: ['auth', 'login', '--claudeai'],
  codex: ['login'],
};

/**
 * Delegates authentication to the installed official CLIs. It never reads,
 * stores, returns, or logs credentials and never starts a shell.
 */
export class ProviderAuthManager {
  private readonly cwd: string;
  private readonly binaries: Record<ProviderId, string>;
  private readonly timeoutMs: number;
  private readonly active = new Map<ProviderId, ActiveLogin>();
  private readonly failed = new Set<ProviderId>();

  constructor(options: ProviderAuthManagerOptions) {
    this.cwd = options.cwd;
    this.binaries = {
      claude: options.claudeBinary ?? 'claude',
      codex: options.codexBinary ?? 'codex',
    };
    this.timeoutMs = options.timeoutMs ?? 10 * 60_000;
  }

  async connections(): Promise<ProviderConnection[]> {
    return Promise.all(PROVIDER_IDS.map((provider) => this.connection(provider)));
  }

  async connect(provider: ProviderId): Promise<ProviderConnectResult> {
    assertProviderId(provider);
    const active = this.active.get(provider);
    if (active) return { provider, status: 'in-progress' };

    const connection = await this.probe(provider);
    if (!connection.installed) {
      throw new ConfigurationError(`${LABELS[provider]} CLI is not installed`);
    }
    if (connection.authenticated === true) {
      return { provider, status: 'already-connected' };
    }

    this.failed.delete(provider);
    const controller = new AbortController();
    const completion = runProcess({
      command: this.binaries[provider],
      args: LOGIN_ARGS[provider],
      cwd: this.cwd,
      timeoutMs: this.timeoutMs,
      signal: controller.signal,
      maxOutputBytes: 64 * 1024,
    })
      .then((result) => {
        if (result.exitCode !== 0 || result.timedOut) this.failed.add(provider);
      })
      .catch(() => {
        if (!controller.signal.aborted) this.failed.add(provider);
      })
      .finally(() => {
        this.active.delete(provider);
      });
    this.active.set(provider, { controller, completion });
    return { provider, status: 'started' };
  }

  async close(): Promise<void> {
    const active = [...this.active.values()];
    for (const login of active) login.controller.abort();
    await Promise.allSettled(active.map((login) => login.completion));
  }

  private async connection(provider: ProviderId): Promise<ProviderConnection> {
    const availability = await this.probe(provider);
    if (this.active.has(provider)) {
      return {
        ...availability,
        state: 'connecting',
        details: 'Complete the sign-in flow in the browser opened by the official CLI.',
      };
    }
    if (!availability.installed) return { ...availability, state: 'unavailable' };
    if (availability.authenticated === true) return { ...availability, state: 'connected' };
    if (availability.authenticated === false) {
      return {
        ...availability,
        state: 'disconnected',
        details: this.failed.has(provider)
          ? 'Sign-in did not complete. Retry here or use the official CLI in your terminal.'
          : 'Sign in with the official CLI to use this provider.',
      };
    }
    return { ...availability, state: 'unknown' };
  }

  private async probe(provider: ProviderId): Promise<Omit<ProviderConnection, 'state'>> {
    const availability =
      provider === 'claude'
        ? await new ClaudeProvider(this.binaries.claude).checkAvailability()
        : await new CodexProvider(this.binaries.codex).checkAvailability();
    return { id: provider, label: LABELS[provider], ...availability };
  }
}

export function isProviderId(value: string): value is ProviderId {
  return (PROVIDER_IDS as readonly string[]).includes(value);
}

function assertProviderId(value: string): asserts value is ProviderId {
  if (!isProviderId(value)) throw new ConfigurationError(`Unsupported provider: ${value}`);
}
