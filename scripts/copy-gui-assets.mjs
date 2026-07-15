import { cp, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath, URL } from 'node:url';

const source = fileURLToPath(new URL('../src/gui/public', import.meta.url));
const target = fileURLToPath(new URL('../dist/gui/public', import.meta.url));

await rm(target, { force: true, recursive: true });
await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
