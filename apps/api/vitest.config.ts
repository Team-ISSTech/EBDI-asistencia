import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

/**
 * NestJS depende de metadatos de decoradores; esbuild (el transformador por
 * defecto de Vitest) no los emite, por eso se usa SWC.
 */
export default defineConfig({
  plugins: [swc.vite({ module: { type: 'es6' } })],
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts', 'load/**/*.test.ts'],
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      // json-summary alimenta el reporte consolidado de RNF-09 (tooling/coverage).
      reporter: ['text', 'json-summary'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/main.ts', 'src/**/*.module.ts', 'src/**/index.ts'],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },
  },
});
