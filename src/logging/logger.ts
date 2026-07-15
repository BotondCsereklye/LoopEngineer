import { redactSecrets } from '../security/secret-redactor.js';
import type { RoleName } from '../domain/types.js';
import type { ReasoningEffort } from '../providers/catalog.js';

export interface RunActivity {
  state: 'thinking' | 'completed' | 'failed';
  role: RoleName;
  provider: string;
  model: string;
  effort: ReasoningEffort;
  startedAt: string;
  finishedAt?: string;
}

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
  activity?(activity: RunActivity): void;
}

export const silentLogger: Logger = { info() {}, warn() {} };

export function consoleLogger(): Logger {
  return {
    info: (message) => console.log(redactSecrets(message)),
    warn: (message) => console.warn(redactSecrets(message)),
  };
}
