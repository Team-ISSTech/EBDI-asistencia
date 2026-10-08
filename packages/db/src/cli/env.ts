import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { config as loadDotenv } from 'dotenv';

const MAX_LEVELS_UP = 5;

/**
 * Busca `.env` desde el directorio actual hacia arriba (la raíz del monorepo
 * cuando se ejecuta con `pnpm --filter @sirai/db`). En contenedores no hay
 * `.env`: las variables llegan por el entorno y no se carga nada.
 */
export function loadRootEnv(startDir = process.cwd()): string | null {
  let dir = startDir;
  for (let level = 0; level < MAX_LEVELS_UP; level += 1) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) {
      loadDotenv({ path: candidate, quiet: true });
      return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}.`);
  return value;
}
