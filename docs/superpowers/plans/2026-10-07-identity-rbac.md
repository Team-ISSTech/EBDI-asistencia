# Plan de implementación: autenticación, RBAC y pantallas base

> **Para agentes:** ejecutar tarea por tarea con `superpowers:executing-plans`.
> Cada tarea termina con lint, typecheck, test y build en verde. Nunca
> `git commit`: se deja el mensaje en `$(git rev-parse --git-dir)/COMMIT_MSG`.

**Objetivo:** un usuario inicia sesión, elige estancia y la API autoriza por
permiso y alcance; la web muestra una pantalla base por funcionalidad.

**Arquitectura:** matriz rol → permiso en `packages/auth` (TypeScript puro);
sesiones en servidor con cookie httpOnly; NestJS con guards que llaman a
`can()`; Drizzle sobre MySQL 8; React Router + TanStack Query + Tailwind.

**Stack:** NestJS 12, Zod, Drizzle ORM + mysql2, argon2, @nestjs/throttler,
Vitest, supertest, React 19, React Router 7, TanStack Query 5, Tailwind 4,
Testing Library, Playwright.

## Restricciones globales

- Node 22+, pnpm 10.24, TypeScript estricto en todos los paquetes.
- Funciones < 50 líneas, complejidad ciclomática < 10, archivos < 400 líneas.
- Sin `console.*`, sin código muerto, sin secretos, sin datos de menores.
- Documentación en español; identificadores en inglés.
- Pruebas antes del código; cada prueba debe verse fallar.
- Mensajes de commit en español, formato `tipo: descripción`, sin coautores.
- Ramas: `docs/fase-1-requisitos`, `chore/foundation-gates`,
  `feat/identity-rbac`, `feat/web-shell-screens`, `chore/docker-stack`; cada una en su worktree bajo
  `.worktrees/`. Las ramas apiladas se arman aplicando el diff staged de la
  rama anterior (`git diff --cached | git apply --index`) y el PR apunta a la
  rama anterior.

---

## `chore/foundation-gates`

### Tarea 1.1: `packages/typescript-config`

**Archivos:** crear `package.json` (`@sirai/typescript-config`), `base.json`
(strict, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noImplicitOverride`, ES2022, `skipLibCheck`), `nest.json` (extiende base:
commonjs, decoradores, `strictPropertyInitialization: false`), `react.json`
(extiende base: ESNext, Bundler, `jsx: react-jsx`, DOM libs, `noEmit`),
`library.json` (extiende base: `NodeNext`, `declaration`). Borrar `.gitkeep`.
Modificar `apps/api/tsconfig.json` y `apps/web/tsconfig.json` para extender
desde el paquete y conservar solo `include`, `outDir`, `baseUrl`.

**Verificación:** `pnpm typecheck` verde en ambas apps.

### Tarea 1.2: `packages/eslint-config`

**Archivos:** crear `package.json` (`@sirai/eslint-config`, ESM), `base.js`
(exporta array flat: `@eslint/js` recommended, typescript-eslint
`recommendedTypeChecked`, reglas `complexity: ['error', 10]`,
`'no-console': 'error'`, `max-lines: ['error', { max: 400 }]`,
`max-depth: ['error', 4]`, `@typescript-eslint/consistent-type-imports`),
`nest.js` (base + globals node), `react.js` (base + react-hooks +
react-refresh + globals browser). Borrar `.gitkeep`. Reescribir
`apps/api/eslint.config.mjs` y `apps/web/eslint.config.js` para consumir el
paquete; mover los plugins de ESLint a devDependencies del paquete.

**Prueba de la regla:** crear temporalmente una función con complejidad 11 y
un `console.log`, correr `pnpm lint`, ver los dos errores, borrar el archivo.

**Verificación:** `pnpm lint` verde.

### Tarea 1.3: CI, versiones, entorno

**Archivos:** crear `.github/workflows/ci.yml` (on pull_request y push a
main; job `quality`: checkout, pnpm/action-setup, setup-node 22 con caché
pnpm, `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`,
`pnpm build`, `pnpm test`; servicio `mysql:8` con healthcheck y
`DATABASE_URL` exportada para las pruebas de integración futuras). Crear
`.nvmrc` (`22`), añadir `engines` (`node >=22`, `pnpm >=10.24`) al
`package.json` raíz, `.env.example` con `PORT`, `DATABASE_URL`,
`SESSION_TTL_HOURS`, `SEED_PASSWORD` (valores de ejemplo, no secretos),
`docker-compose.yml` con MySQL 8 (`sirai`, puerto 3306, volumen nombrado),
`.worktrees/` en `.gitignore`. Actualizar README: requisitos, inicio rápido
con Docker, sección de compuertas de calidad. Borrar `tooling/.gitkeep` solo
si se le da contenido (no en este PR).

**Verificación:** `act` no es obligatorio; validar YAML con `node -e` y revisar
que `pnpm lint && pnpm typecheck && pnpm build && pnpm test` pase localmente.

---

## `feat/identity-rbac`

### Tarea 2.1: `packages/auth` (TDD)

**Archivos:** `package.json` (`@sirai/auth`, sin dependencias de runtime),
`src/roles.ts` (`ROLE_CODES`, tipo `RoleCode`), `src/permissions.ts`
(`PERMISSION_CODES`, tipo `PermissionCode`), `src/matrix.ts`
(`ROLE_PERMISSIONS: Record<RoleCode, readonly PermissionCode[]>`),
`src/principal.ts` (`Principal`, `RoleAssignment { role, estanciaId: number | null }`,
`Scope { estanciaId: number | null }`), `src/can.ts` (`can(principal,
permission, scope): boolean`, `permissionsFor(principal, scope):
PermissionCode[]`), `src/index.ts`, `tsconfig.json`, `vitest.config.ts`,
`src/__tests__/matrix.test.ts`, `src/__tests__/can.test.ts`.

**Pruebas (escribir primero):** la matriz coincide con la tabla del diseño
(una aserción por rol); `DOCENTE` en estancia 1 puede `ASISTENCIA_REGISTRAR`
en estancia 1 y no en estancia 2; `ADMIN_CENTRAL` con `estanciaId: null`
puede `USUARIO_ADMINISTRAR` en cualquier estancia; un principal sin
asignaciones no puede nada; `permissionsFor` une permisos de varias
asignaciones sin duplicados.

### Tarea 2.2: `packages/contracts` (auth)

**Archivos:** `package.json` (`@sirai/contracts`, depende de `zod` y
`@sirai/auth`), `src/auth/login.ts` (`loginRequestSchema { email, password }`,
`LoginRequest`), `src/auth/session.ts` (`sessionResponseSchema`: usuario,
asignaciones, estancia activa, permisos), `src/auth/switch-estancia.ts`,
`src/users/*.ts` (`createUserSchema`, `replaceRolesSchema`, `userSchema`,
`userListResponseSchema`), `src/common/error.ts` (`apiErrorSchema { error:
{ code, message } }`), `src/health.ts`, `src/index.ts`. Pruebas: cada
esquema rechaza un payload inválido representativo y acepta uno válido.

### Tarea 2.3: `packages/config`

**Archivos:** `src/env.ts` con `apiEnvSchema` (Zod: `NODE_ENV`, `PORT`,
`DATABASE_URL` url, `SESSION_TTL_HOURS` entero > 0 por defecto 12,
`SESSION_MAX_HOURS` 72 (tope absoluto),
`LOGIN_MAX_ATTEMPTS` 5, `LOGIN_LOCK_MINUTES` 15, `COOKIE_SECURE` booleano) y
`parseApiEnv(source: NodeJS.ProcessEnv): ApiEnv` que lanza con mensaje
legible. Prueba: falta `DATABASE_URL` → error que la nombra; valores por
defecto aplicados.

### Tarea 2.4: `packages/db`

**Archivos:** `package.json` (`@sirai/db`, `drizzle-orm`, `mysql2`,
`drizzle-kit`), `drizzle.config.ts`, `sql/0000_esquema_equipo.sql` (SQL del
equipo tal cual), `sql/0001_sesiones.sql`, `src/schema/estancias.ts`,
`src/schema/usuarios.ts`, `src/schema/roles.ts` (roles, permisos,
usuario_rol, rol_permiso), `src/schema/sesiones.ts`, `src/schema/auditoria.ts`,
`src/schema/index.ts`, `src/client.ts` (`createDb(url)`, tipo `Db`),
`src/seed/seed.ts` (roles, permisos, `rol_permiso` desde `ROLE_PERMISSIONS`,
2 estancias ficticias, un usuario por rol con `SEED_PASSWORD`), `src/index.ts`.
Script `pnpm --filter @sirai/db migrate` aplica los `.sql` en orden con
`mysql2` y una tabla `_migraciones`. Prueba unitaria: la semilla de
`rol_permiso` se deriva de la matriz (comparar conjuntos).

### Tarea 2.5: API `common/`

**Archivos:** `common/config/config.module.ts` (provee `ApiEnv` con
`parseApiEnv`), `common/database/database.module.ts` (provee `DB` token con
`createDb`), `common/validation/zod-validation.pipe.ts` (+ prueba), `common/audit/audit.service.ts`
(`record({ usuarioId, rolCodigo, accion, tabla, registroId, antes, despues,
http })`), `common/http/request-context.ts` (IP, user agent, request id),
`common/auth/auth.guard.ts`, `common/auth/permissions.guard.ts`,
`common/auth/require-permission.decorator.ts`,
`common/auth/current-principal.decorator.ts`, `common/errors/api-error.ts` +
`api-exception.filter.ts` (formato `{ error: { code, message } }`). Pruebas
unitarias de guards con un `ExecutionContext` falso: sin cookie → 401;
permiso ausente → 403; permiso presente → pasa.

### Tarea 2.6: módulo `identity` (TDD con repositorios en memoria)

**Archivos:** `modules/identity/repositories/users.repository.ts`
(interfaz + `DrizzleUsersRepository` + `InMemoryUsersRepository` en tests),
`sessions.repository.ts`, `services/password-hasher.ts` (argon2id),
`services/auth.service.ts` (`login`, `logout`, `me`, `switchEstancia`),
`services/session.service.ts` (crear token aleatorio 32 bytes, guardar
hash SHA-256, expiración, revocación, `touch`), `services/users.service.ts`
(`list`, `create`, `replaceRoles` con validación de alcance),
`auth.controller.ts`, `users.controller.ts`, `identity.module.ts`.
Pruebas unitarias por servicio según el diseño (login correcto, contraseña
incorrecta, bloqueo tras 5, usuario inactivo, sesión expirada, cambio de
estancia fuera de alcance, asignación fuera de alcance).

### Tarea 2.7: `health`, `main.ts`, throttler, integración

**Archivos:** `modules/health/health.controller.ts` (+ prueba),
`app.module.ts` (Config, Database, Throttler, Identity, Health; filtro
global), `main.ts` (cookie-parser, prefijo `/api` no; CORS con credenciales
para `http://localhost:5173`), borrar `app.controller.ts`,
`test/identity.e2e.test.ts` (supertest sobre MySQL real; `describe.skipIf`
sin `DATABASE_URL` con mensaje), `vitest.config.ts` con cobertura v8 y
umbral 80 % en `src/modules` y `src/common`.

**Verificación final del PR:** `pnpm lint && pnpm typecheck && pnpm build &&
pnpm test` y, con Docker arriba, `pnpm --filter @sirai/db migrate && pnpm
--filter @sirai/db seed && pnpm --filter @sirai/api test`.

---

## `feat/web-shell-screens`

### Tarea 3.1: `packages/ui`

Tailwind 4, `src/styles/tokens.css`, componentes `Button`, `Input`, `Label`,
`Card`, `Badge`, `Table`, `EmptyState`, `PageHeader`; prueba de render para
`Button` (variantes) y `EmptyState`. Borrar `.gitkeep`.

### Tarea 3.2: cliente de API y sesión

`apps/web/src/lib/api-client.ts` (único `fetch`, `credentials: 'include'`,
parsea con esquemas de `@sirai/contracts`, lanza `ApiClientError`),
`features/auth/api.ts`, `features/auth/use-session.ts` (TanStack Query),
`features/auth/require-permission.tsx` (+ prueba), `features/auth/
require-session.tsx`.

### Tarea 3.3: rutas y pantallas

`app/router.tsx`, `app/shell/app-shell.tsx`, `app/shell/sidebar.tsx`
(filtrado por permisos, + prueba), `features/auth/pages/login-page.tsx`,
`select-estancia-page.tsx`, `features/attendance/pages/roll-call-page.tsx`,
`features/children/pages/children-page.tsx`, `features/follow-ups/pages/
follow-ups-page.tsx`, `features/reports/pages/reports-page.tsx`,
`features/administration/pages/users-page.tsx` (real), `features/audit/
pages/audit-page.tsx`, `app/pages/forbidden-page.tsx`.

### Tarea 3.4: e2e

`apps/web/playwright.config.ts`, `e2e/login.spec.ts`: iniciar sesión con el
usuario `directora@sirai.test`, elegir `EBDI-TEST-01`, ver "Pase de lista" en
la navegación y no ver "Usuarios".

**Verificación final del PR:** `pnpm lint && pnpm typecheck && pnpm build &&
pnpm test`; Playwright con API y MySQL arriba.
