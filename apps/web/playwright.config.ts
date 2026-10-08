import { resolve } from 'node:path';
import { defineConfig } from '@playwright/test';
import { config as loadDotenv } from 'dotenv';

loadDotenv({ path: resolve(import.meta.dirname, '../../.env'), quiet: true });

/**
 * Requiere la API y MySQL arriba con la semilla de desarrollo
 * (`pnpm --filter @sirai/db seed`). No corre en CI todavía.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: { baseURL: process.env['E2E_WEB_URL'] ?? 'http://localhost:5173', trace: 'retain-on-failure' },
  webServer: { command: 'pnpm dev', url: 'http://localhost:5173', reuseExistingServer: true },
});
