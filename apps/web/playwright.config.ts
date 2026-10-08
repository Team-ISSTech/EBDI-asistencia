import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';
import { config as loadDotenv } from 'dotenv';

loadDotenv({ path: resolve(import.meta.dirname, '../../.env'), quiet: true });

const externalWebUrl = process.env['E2E_WEB_URL'];

/**
 * Requiere la API y MySQL arriba con la semilla de desarrollo. Sin
 * E2E_WEB_URL levanta Vite; con E2E_WEB_URL (por ejemplo la pila Docker en
 * http://localhost:8080) usa ese servidor. No corre en CI todavía.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: { baseURL: externalWebUrl ?? 'http://localhost:5173', trace: 'retain-on-failure' },
  ...(externalWebUrl ? {} : { webServer: { command: 'pnpm dev', url: 'http://localhost:5173', reuseExistingServer: true } }),
});
