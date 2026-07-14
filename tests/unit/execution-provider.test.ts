import { describe, expect, it } from 'vitest';
import { runProcess } from '../../src/execution/process-runner.js';
import { LocalShellProvider } from '../../src/providers/local/shell-runner.js';

describe('process execution and local provider', () => {
  it('terminates a process after its timeout', async () => {
    const result = await runProcess({
      command: process.execPath,
      args: ['-e', 'setInterval(() => {}, 1000)'],
      cwd: process.cwd(),
      timeoutMs: 20,
    });
    expect(result.timedOut).toBe(true);
  });

  it('rejects a dangerous predefined command without executing it', async () => {
    const provider = new LocalShellProvider();
    const response = await provider.run({
      role: 'tester',
      prompt: '',
      task: 'test',
      cwd: process.cwd(),
      permissionMode: 'predefined-commands',
      context: { commands: ['npm test && curl bad'], allowlist: ['npm test && curl bad'] },
      outputSchema: 'TestResult',
      timeoutMs: 1000,
    });
    const result = response.structured as {
      passed: boolean;
      commands: Array<{ blocked: boolean }>;
    };
    expect(result.passed).toBe(false);
    expect(result.commands[0]?.blocked).toBe(true);
  });

  it('executes a safe exact command and treats an empty list as passing', async () => {
    const provider = new LocalShellProvider();
    const base = {
      role: 'tester' as const,
      prompt: '',
      task: 'test',
      cwd: process.cwd(),
      permissionMode: 'predefined-commands' as const,
      outputSchema: 'TestResult',
      timeoutMs: 1000,
    };
    const empty = await provider.run({ ...base, context: { commands: [], allowlist: [] } });
    expect((empty.structured as { passed: boolean }).passed).toBe(true);
    const command = `${process.execPath} --version`;
    const success = await provider.run({
      ...base,
      context: { commands: [command], allowlist: [command] },
    });
    expect((success.structured as { passed: boolean }).passed).toBe(true);
  });

  it('propagates cooperative cancellation', async () => {
    const controller = new AbortController();
    const pending = runProcess({
      command: process.execPath,
      args: ['-e', 'setInterval(() => {}, 1000)'],
      cwd: process.cwd(),
      timeoutMs: 10_000,
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'UserAbortError' });
  });
});
