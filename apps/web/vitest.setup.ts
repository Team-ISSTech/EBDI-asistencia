import 'fake-indexeddb/auto';
import '@testing-library/jest-dom/vitest';
import { configure } from '@testing-library/react';
import { afterEach } from 'vitest';
import { resetSharedOfflineRuntime } from './src/offline/runtime';

// Con toda la suite corriendo a la vez, 1 s (el valor por defecto) es poco para pantallas que leen IndexedDB.
configure({ asyncUtilTimeout: 5000 });

// Cada prueba empieza con una tablet limpia: lo guardado por una (sesión, copias, cola) no se ve en otra.
afterEach(async () => {
  await resetSharedOfflineRuntime();
});
