import globals from 'globals';
import tseslint from 'typescript-eslint';
import { base } from './base.js';

/** Configuración para `packages/*` sin React ni NestJS. */
export const library = tseslint.config(...base, {
  languageOptions: { globals: globals.node },
});

export default library;
