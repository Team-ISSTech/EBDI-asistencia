/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  // El .env vive en la raíz del monorepo; Vite solo expone las variables VITE_*.
  envDir: '../..',
  plugins: [
    react(),
    tailwindcss(),
    // El Service Worker solo se genera al compilar (no en las pruebas): deja la aplicación misma disponible sin conexión (RF-20).
    ...(process.env['VITEST']
      ? []
      : [
          VitePWA({
            // La versión nueva espera a que se cierren las pestañas: nunca se recarga la pantalla a media captura.
            registerType: 'prompt',
            manifest: {
              name: 'SIRAI',
              short_name: 'SIRAI',
              description: 'Sistema Institucional de Registro Rápido de Asistencia Infantil',
              lang: 'es',
              display: 'standalone',
              start_url: '/app',
              theme_color: '#1f2a44',
              background_color: '#ffffff',
              icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }],
            },
            workbox: {
              // Solo se guarda la aplicación (código, estilos, tipografías). Los datos de la API no pasan por el Service
              // Worker: se guardan cifrados en IndexedDB, por persona, con su propia política.
              globPatterns: ['**/*.{js,css,html,svg,woff,woff2}'],
              navigateFallback: '/index.html',
              navigateFallbackDenylist: [/^\/api\//],
              cleanupOutdatedCaches: true,
            },
          }),
        ]),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // Las pruebas de pantallas completas (con IndexedDB) tardan más cuando corre toda la suite a la vez.
    testTimeout: 20_000,
    include: ['src/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/main.tsx',
        'src/**/*.test.{ts,tsx}',
        'src/app/router.tsx',
        'src/app/providers.tsx',
        'src/features/audit/pages/**',
      ],
      thresholds: { lines: 80, functions: 80, branches: 70, statements: 80 },
    },
  },
});
