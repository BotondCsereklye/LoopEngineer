#!/usr/bin/env node
/* global process */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_PACKAGE_SIZE_BYTES = 2_000_000;
const REQUIRED_PATHS = [
  'LICENSE',
  'README.md',
  'dist/index.js',
  'dist/gui/public/index.html',
  'dist/gui/public/app.js',
  'dist/gui/public/styles.css',
  'package.json',
];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

export function validatePackManifest(manifest) {
  assert(manifest && typeof manifest === 'object', 'npm pack returned no package manifest.');
  assert(manifest.name === 'loop-engineer', `Unexpected package name: ${manifest.name ?? 'none'}`);
  assert(Array.isArray(manifest.files), 'npm pack returned no file list.');

  const files = new Map(manifest.files.map((file) => [file.path, file]));
  for (const requiredPath of REQUIRED_PATHS) {
    assert(files.has(requiredPath), `Package is missing required file: ${requiredPath}`);
  }

  const unexpected = [...files.keys()].filter(
    (filePath) =>
      filePath !== 'LICENSE' &&
      filePath !== 'README.md' &&
      filePath !== 'package.json' &&
      !filePath.startsWith('dist/'),
  );
  assert(
    unexpected.length === 0,
    `Package contains files outside the public contract: ${unexpected.join(', ')}`,
  );
  assert(
    Number(manifest.size) <= MAX_PACKAGE_SIZE_BYTES,
    `Packed tarball exceeds the 2 MB safety limit: ${manifest.size} bytes`,
  );

  const entrypoint = files.get('dist/index.js');
  assert(
    (Number(entrypoint.mode) & 0o111) !== 0,
    'dist/index.js must be executable for the loopeng binary.',
  );
}

export function verifyEntrypoint(root = process.cwd()) {
  const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const relativeEntrypoint = packageJson.bin?.loopeng;
  assert(typeof relativeEntrypoint === 'string', 'package.json must define the loopeng binary.');

  const entrypoint = path.resolve(root, relativeEntrypoint);
  const source = readFileSync(entrypoint, 'utf8');
  assert(
    source.startsWith('#!/usr/bin/env node\n'),
    'dist/index.js must start with the Node shebang.',
  );

  const version = execFileSync(process.execPath, [entrypoint, '--version'], {
    cwd: root,
    encoding: 'utf8',
  }).trim();
  assert(
    version === packageJson.version,
    `CLI version ${version} does not match package version ${packageJson.version}.`,
  );

  return { entrypoint, version };
}

function main() {
  const output = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
    encoding: 'utf8',
  });
  const manifests = JSON.parse(output);
  assert(manifests.length === 1, `Expected one package manifest, received ${manifests.length}.`);

  const manifest = manifests[0];
  validatePackManifest(manifest);
  const { version } = verifyEntrypoint();
  const size = new Intl.NumberFormat('en', { maximumFractionDigits: 1 }).format(
    manifest.size / 1000,
  );
  process.stdout.write(
    `Verified ${manifest.name}@${version}: ${manifest.entryCount} files, ${size} kB packed.\n`,
  );
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (fileURLToPath(import.meta.url) === invokedPath) {
  main();
}
