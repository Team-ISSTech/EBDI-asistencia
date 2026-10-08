import globals from 'globals';
import tseslint from 'typescript-eslint';
import { base } from './base.js';

/**
 * Configuración para `apps/api`: reglas con información de tipos.
 * `tsconfigRootDir` lo aporta cada app porque depende de su ubicación.
 *
 * @param {string} tsconfigRootDir Directorio que contiene el tsconfig de la app.
 */
export function nest(tsconfigRootDir) {
  return tseslint.config(
    ...base,
    ...tseslint.configs.recommendedTypeChecked,
    {
      languageOptions: {
        globals: globals.node,
        parserOptions: { projectService: true, tsconfigRootDir },
      },
    },
    {
      files: ['**/*.test.ts', '**/*.spec.ts'],
      rules: { '@typescript-eslint/unbound-method': 'off' },
    },
  );
}

export default nest;
