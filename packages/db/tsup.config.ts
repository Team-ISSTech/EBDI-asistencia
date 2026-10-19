import { defineConfig } from 'tsup';

/**
 * Dos salidas: la biblioteca (ESM + CJS, con tipos) y los CLI de migración,
 * semilla y primer administrador (solo ESM, usan await de nivel superior) para ejecutarlos con
 * `node` dentro de la imagen de producción, sin tsx ni devDependencies.
 */
export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    sourcemap: true,
    clean: true,
    external: ['mysql2', 'argon2'],
  },
  {
    entry: { 'cli/migrate': 'src/cli/migrate.ts', 'cli/seed': 'src/cli/seed.ts', 'cli/create-admin': 'src/cli/create-admin.ts' },
    format: ['esm'],
    sourcemap: true,
    // dotenv es CommonJS: debe resolverse en tiempo de ejecución, no empaquetarse en ESM.
    external: ['mysql2', 'argon2', 'dotenv'],
  },
]);
