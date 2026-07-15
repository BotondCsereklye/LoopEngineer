import { chmod, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ProviderAuthManager } from '../../src/providers/auth.js';

describe('provider authentication manager', () => {
  it('delegates sign-in to the official CLIs and only exposes redacted status', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'loopeng-auth-'));
    const binary = await fakeAuthCli(root);
    const manager = new ProviderAuthManager({
      cwd: root,
      claudeBinary: binary,
      codexBinary: binary,
      timeoutMs: 2_000,
    });

    try {
      expect(await manager.connections()).toEqual([
        expect.objectContaining({
          id: 'claude',
          installed: true,
          authenticated: false,
          state: 'disconnected',
        }),
        expect.objectContaining({
          id: 'codex',
          installed: true,
          authenticated: false,
          state: 'disconnected',
        }),
      ]);

      await expect(manager.connect('claude')).resolves.toEqual({
        provider: 'claude',
        status: 'started',
      });
      await expect(manager.connect('codex')).resolves.toEqual({
        provider: 'codex',
        status: 'started',
      });

      await waitFor(async () =>
        (await manager.connections()).every((connection) => connection.authenticated === true),
      );
      const connected = await manager.connections();
      expect(connected.every((connection) => connection.state === 'connected')).toBe(true);
      expect(JSON.stringify(connected)).not.toContain('oauth-token');
    } finally {
      await manager.close();
    }
  });

  it('rejects unknown providers and reports missing CLIs without spawning a shell', async () => {
    const manager = new ProviderAuthManager({
      cwd: process.cwd(),
      claudeBinary: '/definitely/missing-claude',
      codexBinary: '/definitely/missing-codex',
      timeoutMs: 200,
    });

    expect((await manager.connections()).every((connection) => !connection.installed)).toBe(true);
    await expect(manager.connect('claude')).rejects.toThrow(/not installed/i);
    await expect(manager.connect('other' as 'claude')).rejects.toThrow(/Unsupported provider/);
    await manager.close();
  });
});

async function fakeAuthCli(root: string): Promise<string> {
  const binary = path.join(root, 'fake-auth-cli');
  await writeFile(
    binary,
    `#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const args = process.argv.slice(2);
const marker = (name) => path.join(__dirname, name + '.connected');
if (args[0] === '--version') {
  console.log('fake-cli 1.0');
} else if (args[0] === 'auth' && args[1] === 'status') {
  if (fs.existsSync(marker('claude'))) console.log(JSON.stringify({ loggedIn: true, secret: 'oauth-token' }));
  else process.exitCode = 1;
} else if (args[0] === 'auth' && args[1] === 'login') {
  fs.writeFileSync(marker('claude'), 'oauth-token');
} else if (args[0] === 'login' && args[1] === 'status') {
  if (fs.existsSync(marker('codex'))) console.log('Logged in');
  else { console.error('Not logged in'); process.exitCode = 1; }
} else if (args[0] === 'login') {
  fs.writeFileSync(marker('codex'), 'oauth-token');
} else {
  process.exitCode = 2;
}
`,
    'utf8',
  );
  await chmod(binary, 0o755);
  return binary;
}

async function waitFor(predicate: () => Promise<boolean>): Promise<void> {
  const deadline = Date.now() + 2_000;
  while (!(await predicate())) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for provider login');
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
