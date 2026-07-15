import { spawn } from 'node:child_process';
import { CONFIG_FILE_NAME } from '../config/defaults.js';
import { createDefaultGuiServices } from './services.js';
import { createGuiServer } from './server.js';

export interface StartGuiOptions {
  cwd?: string;
  config?: string;
  port?: number;
  open?: boolean;
}

export async function startGui(options: StartGuiOptions = {}): Promise<void> {
  const cwd = options.cwd ?? process.cwd();
  const services = await createDefaultGuiServices(cwd, options.config ?? CONFIG_FILE_NAME);
  const gui = await createGuiServer({
    host: '127.0.0.1',
    port: options.port ?? 4317,
    services,
  });
  console.log(`Loop Engineer GUI: ${gui.url}`);

  if (options.open !== false) openBrowser(gui.url, cwd);

  await new Promise<void>((resolve) => {
    let closing = false;
    const close = () => {
      if (closing) return;
      closing = true;
      void gui
        .close()
        .catch((error: unknown) => {
          console.warn(error instanceof Error ? error.message : String(error));
        })
        .finally(resolve);
    };
    process.once('SIGINT', close);
    process.once('SIGTERM', close);
  });
}

function openBrowser(url: string, cwd: string): void {
  const [command, args] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]];
  const child = spawn(command, args, {
    cwd,
    detached: true,
    shell: false,
    stdio: 'ignore',
  });
  child.on('error', () => {
    console.warn(`Could not open the browser automatically. Open ${url} manually.`);
  });
  child.unref();
}
