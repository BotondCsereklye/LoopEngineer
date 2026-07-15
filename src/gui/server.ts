import { randomBytes, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { LoopEngineerConfig } from '../config/schema.js';
import type { DoctorCheck } from '../cli/commands/doctor.js';
import type { Logger } from '../logging/logger.js';
import type { OrchestratorResult } from '../workflow/orchestrator.js';
import type { RunReport } from '../reports/types.js';
import { redactDeep, redactSecrets } from '../security/secret-redactor.js';
import { guiRunRequestSchema, type GuiRunRequest } from './schema.js';

const MAX_BODY_BYTES = 256 * 1024;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', '::1']);

export interface GuiBootstrap {
  root: string;
  config: LoopEngineerConfig;
  doctor: DoctorCheck[];
  reports: RunReport[];
}

export interface GuiServices {
  bootstrap(): Promise<GuiBootstrap>;
  run(request: GuiRunRequest, signal: AbortSignal, logger: Logger): Promise<OrchestratorResult>;
  report(runId: string): Promise<string>;
}

export interface GuiServerOptions {
  host?: string;
  port?: number;
  services: GuiServices;
  csrfToken?: string;
}

export interface GuiServer {
  url: string;
  close(): Promise<void>;
}

type GuiRunStatus = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';

interface GuiRunSnapshot {
  id?: string;
  status: GuiRunStatus;
  startedAt?: string;
  finishedAt?: string;
  events: string[];
  result?: OrchestratorResult;
  error?: string;
}

interface Asset {
  contentType: string;
  body: Buffer;
}

export async function createGuiServer(options: GuiServerOptions): Promise<GuiServer> {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 4317;
  if (!LOOPBACK_HOSTS.has(host)) throw new Error('GUI server must bind to a loopback address');
  if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error('Invalid GUI port');

  const csrfToken = options.csrfToken ?? randomBytes(32).toString('hex');
  const assets = await loadAssets();
  let snapshot: GuiRunSnapshot = { status: 'idle', events: [] };
  let activeController: AbortController | undefined;
  let origin = '';

  const server = createServer((request, response) => {
    void routeRequest(request, response).catch((error: unknown) => {
      sendJson(response, 500, {
        error: 'GUI request failed',
        detail: redactSecrets(error instanceof Error ? error.message : String(error)).slice(0, 500),
      });
    });
  });

  async function routeRequest(request: IncomingMessage, response: ServerResponse): Promise<void> {
    const method = request.method ?? 'GET';
    const pathname = new URL(request.url ?? '/', origin || `http://${host}`).pathname;

    if (method === 'GET' && assets.has(pathname)) {
      const asset = assets.get(pathname)!;
      send(
        response,
        200,
        asset.body,
        asset.contentType,
        pathname === '/' ? 'no-store' : 'no-cache',
      );
      return;
    }
    if (method === 'GET' && pathname === '/api/bootstrap') {
      const bootstrap = await options.services.bootstrap();
      sendJson(response, 200, { ...bootstrap, csrfToken });
      return;
    }
    if (method === 'GET' && pathname === '/api/run') {
      sendJson(response, 200, snapshot);
      return;
    }
    if (method === 'GET' && pathname.startsWith('/api/reports/')) {
      const runId = pathname.slice('/api/reports/'.length);
      if (!/^run-[A-Za-z0-9-]+$/.test(runId)) {
        sendJson(response, 400, { error: 'Invalid run ID' });
        return;
      }
      const report = await options.services.report(runId);
      send(response, 200, report, 'text/markdown; charset=utf-8', 'no-store');
      return;
    }
    if (method === 'POST' && pathname === '/api/run') {
      if (!isTrustedMutation(request, csrfToken, origin)) {
        sendJson(response, 403, { error: 'Request origin or CSRF token rejected' });
        return;
      }
      if (snapshot.status === 'running') {
        sendJson(response, 409, { error: 'A run is already active' });
        return;
      }
      let body: unknown;
      try {
        body = await readJson(request);
      } catch (error) {
        sendJson(response, 400, {
          error: error instanceof Error ? error.message : 'Invalid request body',
        });
        return;
      }
      const parsed = guiRunRequestSchema.safeParse(body);
      if (!parsed.success) {
        sendJson(response, 400, {
          error: 'Invalid run request',
          details: parsed.error.issues.map((issue) => ({
            path: issue.path.join('.'),
            message: issue.message,
          })),
        });
        return;
      }

      activeController = new AbortController();
      snapshot = {
        id: randomUUID(),
        status: 'running',
        startedAt: new Date().toISOString(),
        events: [],
      };
      const logger: Logger = {
        info(message) {
          snapshot = { ...snapshot, events: [...snapshot.events, redactSecrets(message)] };
        },
        warn(message) {
          snapshot = { ...snapshot, events: [...snapshot.events, redactSecrets(message)] };
        },
      };
      const controller = activeController;
      void options.services
        .run(parsed.data, controller.signal, logger)
        .then((result) => {
          snapshot = {
            ...snapshot,
            status: 'completed',
            finishedAt: new Date().toISOString(),
            result,
          };
        })
        .catch((error: unknown) => {
          snapshot = {
            ...snapshot,
            status: controller.signal.aborted ? 'cancelled' : 'failed',
            finishedAt: new Date().toISOString(),
            error: redactSecrets(error instanceof Error ? error.message : String(error)).slice(
              0,
              1_000,
            ),
          };
        })
        .finally(() => {
          if (activeController === controller) activeController = undefined;
        });
      sendJson(response, 202, snapshot);
      return;
    }
    if (method === 'POST' && pathname === '/api/cancel') {
      if (!isTrustedMutation(request, csrfToken, origin)) {
        sendJson(response, 403, { error: 'Request origin or CSRF token rejected' });
        return;
      }
      if (!activeController || snapshot.status !== 'running') {
        sendJson(response, 409, { error: 'No active run' });
        return;
      }
      activeController.abort();
      snapshot = {
        ...snapshot,
        status: 'cancelled',
        finishedAt: new Date().toISOString(),
        events: [...snapshot.events, 'Cancellation requested'],
      };
      sendJson(response, 202, snapshot);
      return;
    }
    sendJson(response, 404, { error: 'Not found' });
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });
  const address = server.address() as AddressInfo;
  origin = `http://${host.includes(':') ? `[${host}]` : host}:${address.port}`;

  return {
    url: origin,
    async close() {
      activeController?.abort();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

async function loadAssets(): Promise<Map<string, Asset>> {
  const definitions = [
    ['/', 'index.html', 'text/html; charset=utf-8'],
    ['/styles.css', 'styles.css', 'text/css; charset=utf-8'],
    ['/app.js', 'app.js', 'text/javascript; charset=utf-8'],
  ] as const;
  const entries = await Promise.all(
    definitions.map(
      async ([route, file, contentType]) =>
        [
          route,
          { body: await readFile(new URL(`./public/${file}`, import.meta.url)), contentType },
        ] as const,
    ),
  );
  return new Map(entries);
}

function isTrustedMutation(request: IncomingMessage, csrfToken: string, origin: string): boolean {
  return (
    request.headers.origin === origin &&
    request.headers['x-loop-csrf'] === csrfToken &&
    request.headers['content-type']?.toLowerCase().startsWith('application/json') === true
  );
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    size += buffer.length;
    if (size > MAX_BODY_BYTES) throw new Error('Request body exceeds 256 KiB');
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch {
    throw new Error('Request body is not valid JSON');
  }
}

function securityHeaders(cacheControl: string): Record<string, string> {
  return {
    'cache-control': cacheControl,
    'content-security-policy':
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'",
    'cross-origin-opener-policy': 'same-origin',
    'permissions-policy': 'camera=(), microphone=(), geolocation=()',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
  };
}

function sendJson(response: ServerResponse, status: number, value: unknown): void {
  send(
    response,
    status,
    `${JSON.stringify(redactDeep(value))}\n`,
    'application/json; charset=utf-8',
    'no-store',
  );
}

function send(
  response: ServerResponse,
  status: number,
  body: string | Buffer,
  contentType: string,
  cacheControl: string,
): void {
  response.writeHead(status, {
    ...securityHeaders(cacheControl),
    'content-type': contentType,
  });
  response.end(body);
}
