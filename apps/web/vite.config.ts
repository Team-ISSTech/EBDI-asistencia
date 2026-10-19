/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  // El .env vive en la raíz del monorepo; Vite solo expone las variables VITE_*.
  envDir: '../..',
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // Las pruebas de pantallas completas (con IndexedDB) tardan más cuando corre toda la suite a la vez.
    testTimeout: 20_000,
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main.tsx',
        'src/**/*.test.{ts,tsx}',
        'src/app/router.tsx',
        'src/app/providers.tsx',
        'src/features/audit/pages/**',
      ],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
    },
  },
});
