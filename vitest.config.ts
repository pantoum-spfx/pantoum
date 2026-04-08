import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    exclude: ['node_modules/**', 'dist/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.spec.ts',
        'node_modules/**',
        'dist/**',
      ],
      thresholds: {
        lines: 3,
        functions: 3,
        branches: 1,
        statements: 3,
      },
    },
    // ESM support
    deps: {
      interopDefault: true,
    },
  },
});
