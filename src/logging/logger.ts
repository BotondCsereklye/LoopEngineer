import { redactSecrets } from '../security/secret-redactor.js';

export interface Logger {
  info(message: string): void;
  warn(message: string): void;
}

export const silentLogger: Logger = { info() {}, warn() {} };

export function consoleLogger(): Logger {
  return {
    info: (message) => console.log(redactSecrets(message)),
    warn: (message) => console.warn(redactSecrets(message)),
  };
}
