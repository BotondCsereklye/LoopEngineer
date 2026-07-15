import { describe, expect, it } from 'vitest';
// Build tooling stays in scripts/ and does not ship as a TypeScript library.
// @ts-expect-error The verifier is an ESM build script with no declaration file.
import { validatePackManifest } from '../../scripts/verify-package.mjs';

const validManifest = {
  name: 'loop-engineer',
  version: '0.1.0',
  size: 68_447,
  files: [
    { path: 'LICENSE', mode: 0o644 },
    { path: 'README.md', mode: 0o644 },
    { path: 'dist/index.js', mode: 0o755 },
    { path: 'dist/gui/public/app.js', mode: 0o644 },
    { path: 'dist/gui/public/index.html', mode: 0o644 },
    { path: 'dist/gui/public/styles.css', mode: 0o644 },
    { path: 'package.json', mode: 0o644 },
  ],
};

describe('npm package verifier', () => {
  it('accepts the publishable package contract', () => {
    expect(() => validatePackManifest(validManifest)).not.toThrow();
  });

  it('rejects source files and missing runtime assets', () => {
    expect(() =>
      validatePackManifest({
        ...validManifest,
        files: validManifest.files
          .filter((file) => file.path !== 'dist/gui/public/index.html')
          .concat({ path: 'src/index.ts', mode: 0o644 }),
      }),
    ).toThrow(/dist\/gui\/public\/index\.html/);
  });

  it('rejects a non-executable CLI entrypoint', () => {
    expect(() =>
      validatePackManifest({
        ...validManifest,
        files: validManifest.files.map((file) =>
          file.path === 'dist/index.js' ? { ...file, mode: 0o644 } : file,
        ),
      }),
    ).toThrow(/executable/);
  });

  it('rejects an unexpectedly large tarball', () => {
    expect(() => validatePackManifest({ ...validManifest, size: 2_000_001 })).toThrow(/2 MB/);
  });
});
