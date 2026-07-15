import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      exclude: [
        'node_modules/**',
        'dist/**',
        'coverage/**',
        // Runtime data (runs, worktrees) must never count towards coverage.
        '.loop-engineer/**',
        'scripts/**',
        'tests/**',
        '*.config.{js,ts}',
        'src/index.ts',
        'src/cli/app.ts',
        // Browser-side assets are exercised via the GUI server integration test,
        // not instrumentable by the Node coverage provider.
        'src/gui/public/**',
        'src/**/*.d.ts',
      ],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
});
