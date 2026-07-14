import { randomBytes } from 'node:crypto';

export function createRunId(
  now = new Date(),
  random = () => randomBytes(2).toString('hex'),
): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
  const suffix =
    random()
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 8) || '0000';
  return `run-${stamp}-${suffix}`;
}
