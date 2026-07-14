import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      exclude: [
        'dist/**',
        'coverage/**',
        '*.config.{js,ts}',
        'src/index.ts',
        'src/cli/app.ts',
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
