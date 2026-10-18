import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    fileParallelism: false,
    // Aplicar todas las migraciones a una base vacía tarda varios segundos y crece con cada una.
    testTimeout: 30_000,
    hookTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/cli/**', 'src/schema/**'],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
    },
  },
});
