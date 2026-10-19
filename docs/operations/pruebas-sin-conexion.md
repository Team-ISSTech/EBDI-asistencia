# Probar el modo sin conexión en un navegador real

Las pruebas de Vitest cubren la cola, el cifrado, el envío y las pantallas. Esta prueba de
Playwright (`apps/web/e2e/offline-capture.spec.ts`) comprueba lo que solo un navegador real
puede: que el Service Worker abre la aplicación sin red, que IndexedDB conserva las capturas
cifradas y que se envían solas al volver la conexión. **Corre en CI** en el trabajo «e2e»
(`.github/workflows/ci.yml`), que levanta MySQL, la API y la web compilada; los pasos de abajo son para repetirla en tu máquina.

## Requisitos

- MySQL 8 local (el de `docker compose`) y el `.env` de la raíz.
- Una base **dedicada** para esta prueba; se vacía por completo. No uses la de desarrollo.
- Chromium de Playwright: `pnpm --filter @sirai/web exec playwright install chromium`.
- La web **compilada**: el Service Worker no existe en `pnpm dev`.

## Pasos

```bash
set -a && . ./.env && set +a
E2E_DB=mysql://sirai:sirai@127.0.0.1:3307/sirai_test

# 1. Base limpia con migraciones y semilla (usa @sirai/db; ejecútalo desde apps/api)
cd apps/api && E2E_DATABASE_URL=$E2E_DB node -e "
const { resolve } = require('node:path');
const db = require('@sirai/db');
(async () => {
  await db.dropAllObjects(process.env.E2E_DATABASE_URL);
  await db.applyMigrations(process.env.E2E_DATABASE_URL, resolve(process.cwd(), '../../packages/db/sql'));
  const c = db.connect(process.env.E2E_DATABASE_URL);
  await db.syncRolePermissions(c.db);
  await db.seedDevelopmentData(c.db, process.env.SEED_PASSWORD);
  await c.close();
})();"
cd ../..

# 2. API en el puerto 3100 y web compilada en el 4173
pnpm --filter @sirai/api build
PORT=3100 DATABASE_URL=$E2E_DB WEB_ORIGIN=http://localhost:4173 LOGIN_RATE_LIMIT_PER_MINUTE=1000 \
  FOLLOW_UP_JOB_SECONDS=0 node apps/api/dist/main.js &
cd apps/web && VITE_API_URL=http://localhost:3100 pnpm exec vite build
pnpm exec vite preview --port 4173 --strictPort &

# 3. La prueba
E2E_WEB_URL=http://localhost:4173 pnpm exec playwright test e2e/offline-capture.spec.ts
```

Al terminar, detén los dos procesos en segundo plano. Para repetir la prueba, vuelve a vaciar
la base (paso 1): la lista del turno debe empezar sin infantes de otras corridas.

## Qué comprueba

1. Con conexión: inicia sesión, abre la jornada, carga la lista y deja que el Service Worker
   tome el control.
2. Corta la red: aparece la franja de «Sin conexión», pasa lista, guarda y ve el aviso de que
   quedó en la tablet.
3. Lee IndexedDB y verifica que **no aparece ningún nombre de infante** (todo va cifrado).
4. Recarga sin red: la aplicación abre, con la sesión y la lista guardadas, y lo marcado sigue ahí.
5. Restablece la red: la captura se envía sola y el servidor tiene a todos como presentes.
