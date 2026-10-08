import { resolve } from 'node:path';
import { config as loadDotenv } from 'dotenv';

/** Carga `.env` de la raíz del monorepo en desarrollo; en CI/producción se exportan variables. */
export function loadRootEnv(): void {
  loadDotenv({ path: resolve(__dirname, '../../../../../.env'), quiet: true });
}
