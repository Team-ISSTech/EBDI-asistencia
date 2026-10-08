import { config as loadDotenv } from 'dotenv';
import { resolve } from 'node:path';

/** Los CLI leen `.env` de la raíz del monorepo si existe; CI exporta variables. */
export function loadRootEnv(): void {
  loadDotenv({ path: resolve(import.meta.dirname, '../../../../.env'), quiet: true });
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}.`);
  return value;
}
