import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Límites de calidad del proyecto (ver "Compuertas de calidad" en README.md):
 * complejidad ciclomática máxima 10 (ESLint admite 10; el SRS pide "< 10"
 * por método, así que 10 es el techo tolerado), sin salida por consola,
 * archivos cortos y poco anidamiento. Se aplican a todo el TypeScript del
 * monorepo.
 */
const MAX_CYCLOMATIC_COMPLEXITY = 10;
const MAX_LINES_PER_FILE = 400;
const MAX_NESTING_DEPTH = 4;

/** Reglas propias del proyecto, independientes del framework. */
export const projectRules = {
  complexity: ['error', { max: MAX_CYCLOMATIC_COMPLEXITY }],
  'max-lines': ['error', { max: MAX_LINES_PER_FILE, skipBlankLines: true, skipComments: true }],
  'max-depth': ['error', MAX_NESTING_DEPTH],
  'no-console': 'error',
  'no-debugger': 'error',
  eqeqeq: ['error', 'always'],
  'prefer-const': 'error',
  '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
  '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
};

/** Configuración base: reglas recomendadas sin información de tipos. */
export const base = tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  { rules: projectRules },
);

export default base;
