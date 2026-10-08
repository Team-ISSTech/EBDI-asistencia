import { nest } from '@sirai/eslint-config/nest';

export default [
  ...nest(import.meta.dirname),
  {
    // supertest expone `any` en servidor y cuerpo de respuesta; las aserciones
    // de integración validan la forma real, no el tipo estático.
    files: ['test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
    },
  },
];
