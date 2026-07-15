import { describe, expect, it } from 'vitest';
import { createCli } from '../../src/cli/app.js';

describe('GUI CLI command', () => {
  it('exposes local dashboard configuration flags', () => {
    const command = createCli().commands.find((candidate) => candidate.name() === 'gui');

    expect(command).toBeDefined();
    expect(command?.description()).toContain('local');
    expect(command?.options.map((option) => option.long)).toEqual([
      '--config',
      '--port',
      '--no-open',
    ]);
  });
});
