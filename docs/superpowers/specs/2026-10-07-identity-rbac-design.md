# Diseño: Autenticación, RBAC y pantallas base

- Fecha: 2026-10-07
- Estado: aprobado por el equipo en sesión de diseño
- Depende de: ADR-003 (stack TypeScript), ADR-004 (MySQL 8 + Drizzle)

## Objetivo

Que un usuario inicie sesión, elija la estancia en la que trabaja y la API
autorice cada operación según el permiso requerido y el alcance de sus roles.
Entregar además la cáscara de la aplicación web con una pantalla básica por
funcionalidad del SRS, protegida por permisos, para que los módulos siguientes
solo rellenen contenido.

Fuera de alcance: pase de lista real, offline, reportes, seguimientos. Sus
pantallas quedan como estados vacíos con la estructura final.

## Entregas (una rama, un PR cada una)

| Rama | Contenido | Tamaño estimado |
| --- | --- | --- |
| `docs/fase-1-requisitos` | ADR-003, ADR-004, SRS, RTM, modelo de datos, este diseño | solo documentación |
| `chore/foundation-gates` | `packages/typescript-config`, `packages/eslint-config` (complejidad 10, `no-console`), GitHub Actions, `engines`, `.nvmrc`, `.env.example`, `docker-compose.yml` con MySQL 8 | ~250 líneas |
| `feat/identity-rbac` | `packages/auth`, `packages/contracts`, `packages/db`, `packages/config`, módulo `identity` en la API, `/health`, semilla de desarrollo, pruebas | PR grande de funcionalidad |
| `feat/web-shell-screens` | `packages/ui`, enrutado, login, selección de estancia, cáscara con navegación por permisos, pantallas base, pruebas | PR grande de funcionalidad |
| `chore/docker-stack` | Dockerfiles, nginx, `docker-compose.yml` con la pila completa, imágenes en GHCR | ~650 líneas |

## Modelo de autorización (`packages/auth`)

- TypeScript puro, sin dependencias de React, NestJS ni ORM.
- Códigos de rol y permiso idénticos a la semilla del esquema del equipo:
  roles `DIRECTORA`, `DOCENTE`, `TRABAJO_SOCIAL`, `ENFERMERIA`, `MEDICO`,
  `SUPERVISOR_CENTRAL`, `ADMIN_CENTRAL`; permisos `ASISTENCIA_CONSULTAR`,
  `ASISTENCIA_REGISTRAR`, `JORNADA_CERRAR`, `SEGUIMIENTO_CONSULTAR`,
  `SEGUIMIENTO_REGISTRAR`, `NOTA_SENSIBLE_CONSULTAR`, `ALTA_MEDICA_REGISTRAR`,
  `REPORTE_AGREGADO_CONSULTAR`, `USUARIO_ADMINISTRAR`, `AUDITORIA_CONSULTAR`.
- Matriz rol → permisos en código, fuente de verdad; `rol_permiso` en la base
  de datos se siembra desde ella. Matriz derivada de la tabla de permisos del
  SRS:

| Rol | Permisos |
| --- | --- |
| DOCENTE | ASISTENCIA_CONSULTAR, ASISTENCIA_REGISTRAR |
| TRABAJO_SOCIAL | ASISTENCIA_CONSULTAR, SEGUIMIENTO_CONSULTAR, SEGUIMIENTO_REGISTRAR, NOTA_SENSIBLE_CONSULTAR |
| ENFERMERIA | igual que TRABAJO_SOCIAL |
| MEDICO | TRABAJO_SOCIAL + ALTA_MEDICA_REGISTRAR |
| DIRECTORA | DOCENTE + TRABAJO_SOCIAL + JORNADA_CERRAR + REPORTE_AGREGADO_CONSULTAR |
| SUPERVISOR_CENTRAL | REPORTE_AGREGADO_CONSULTAR |
| ADMIN_CENTRAL | USUARIO_ADMINISTRAR, AUDITORIA_CONSULTAR, REPORTE_AGREGADO_CONSULTAR |

- Alcance: una asignación `usuario_rol` con `estancia_id` concede solo dentro
  de esa estancia; con `estancia_id = NULL` (roles centrales) concede en todas.
- API pública: `can(principal, permission, scope)`, `permissionsFor(principal,
  scope)`, `ROLE_PERMISSIONS`, tipos `RoleCode`, `PermissionCode`, `Principal`
  (`{ userId, assignments: { role, estanciaId | null }[] }`).
- Pruebas unitarias: la matriz coincide con la tabla del SRS; `can()` respeta
  alcance por estancia y roles centrales; un rol sin asignación niega.

## Persistencia (`packages/db`)

- Drizzle ORM + `mysql2`. Esquema Drizzle de las tablas usadas en esta fase:
  `estancias`, `usuarios`, `roles`, `permisos`, `usuario_rol`, `rol_permiso`,
  `auditoria` y la nueva `sesiones`.
- Migración 0000 = SQL del equipo sin cambios (todas las tablas) + migración
  0001 = `sesiones`. Así el entregable de F4 es el SQL versionado.
- `sesiones`: `id`, `usuario_id` FK, `estancia_activa_id` FK nullable,
  `token_hash BINARY(32)` único, `expira_at`, `revocada_at`, `ip_origen`,
  `user_agent`, `created_at`, `ultimo_uso_at`.
- Cliente exportado como `createDb(url)`; nada fuera de `packages/db` importa
  `mysql2`.
- Sin `DELETE` físico en ninguna operación de la API.

## API (`apps/api`)

Estructura:

```text
apps/api/src/
├── main.ts
├── app.module.ts
├── common/
│   ├── config/        # Zod env (DATABASE_URL, SESSION_TTL_HOURS, ...)
│   ├── database/      # DatabaseModule: provee el cliente Drizzle
│   ├── audit/         # AuditService: INSERT en auditoria con contexto HTTP
│   ├── auth/          # AuthGuard, PermissionsGuard, @RequirePermission, @CurrentPrincipal
│   └── validation/    # ZodValidationPipe
├── modules/
│   ├── health/
│   └── identity/
│       ├── identity.module.ts
│       ├── auth.controller.ts
│       ├── users.controller.ts
│       ├── services/      # AuthService, SessionService, UsersService, PasswordHasher
│       ├── repositories/  # interfaces + implementación Drizzle
│       └── dto/           # re-exporta esquemas de packages/contracts
└── test/                  # pruebas de integración (supertest + MySQL)
```

Endpoints:

| Método y ruta | Permiso | Comportamiento |
| --- | --- | --- |
| `GET /health` | público | `{ status: 'ok', db: 'up' \| 'down' }` |
| `POST /auth/login` | público | correo + contraseña; argon2id; 5 fallos → bloqueo 15 min; crea sesión; cookie `sirai_session` httpOnly, SameSite=Strict, Secure en producción; audita `LOGIN` y `LOGIN_FALLIDO` |
| `POST /auth/logout` | sesión | marca `revocada_at`; borra cookie; audita `LOGOUT` |
| `GET /auth/me` | sesión | principal, asignaciones, estancia activa, permisos resueltos para la estancia activa |
| `POST /auth/estancia` | sesión | cambia `estancia_activa_id`; solo a una estancia con asignación o cualquiera si tiene rol central; audita `CAMBIO_ESTANCIA` |
| `GET /usuarios` | USUARIO_ADMINISTRAR | lista usuarios y asignaciones (alcance global en Fase 1) |
| `POST /usuarios` | USUARIO_ADMINISTRAR | crea usuario con contraseña temporal; audita |
| `PATCH /usuarios/:id/roles` | USUARIO_ADMINISTRAR | reemplaza asignaciones cerrando las anteriores (`vigente_hasta`), nunca las borra; audita con diff |

Reglas:

- Controladores solo traducen HTTP; la lógica vive en servicios con
  repositorios inyectados por interfaz, lo que permite pruebas unitarias con
  repositorios en memoria.
- Toda respuesta de error usa `{ error: { code, message } }`; los mensajes no
  revelan si el correo existe.
- Límite de tasa en `/auth/login` (`@nestjs/throttler`, 10/min por IP).
- Funciones < 50 líneas, complejidad < 10, sin `console`.

Pruebas:

- Unitarias: AuthService (login correcto, contraseña incorrecta, bloqueo,
  usuario inactivo), SessionService (expiración, revocación), UsersService
  (alcance al asignar roles). Repositorios en memoria que implementan la misma
  interfaz que los de Drizzle.
- Integración (supertest + MySQL 8 real): login → cookie → `/auth/me`;
  403 sin permiso; cambio de estancia fuera de alcance → 403; fila en
  `auditoria` tras login. Se omiten con mensaje visible si falta
  `DATABASE_URL`; nunca pasan en silencio.

## Web (`apps/web` + `packages/ui`)

- React Router, TanStack Query, Tailwind CSS v4. `packages/ui` contiene
  primitivas propias: `Button`, `Input`, `Label`, `Card`, `Badge`, `Table`,
  `EmptyState`, `PageHeader`, con tokens en CSS (`--color-*`, `--space-*`).
- Dirección visual: institucional sobria, alto contraste, orientada a tabletas
  en estancias; tipografía Inter; color semántico para estados de asistencia
  (se definen ahora como tokens aunque la pantalla sea un placeholder).
- Rutas:

| Ruta | Permiso | Pantalla |
| --- | --- | --- |
| `/iniciar-sesion` | público | formulario de acceso con errores claros |
| `/seleccionar-estancia` | sesión | lista de estancias asignadas; roles centrales ven todas |
| `/app` | sesión + estancia | cáscara: barra lateral filtrada por permisos, encabezado con estancia y rol, cierre de sesión |
| `/app/pase-de-lista` | ASISTENCIA_CONSULTAR | estructura final con estado vacío |
| `/app/infantes` | ASISTENCIA_CONSULTAR | estado vacío |
| `/app/seguimientos` | SEGUIMIENTO_CONSULTAR | estado vacío |
| `/app/reportes` | REPORTE_AGREGADO_CONSULTAR | estado vacío |
| `/app/administracion/usuarios` | USUARIO_ADMINISTRAR | real: tabla, alta y asignación de roles |
| `/app/auditoria` | AUDITORIA_CONSULTAR | estado vacío |
| `/app/sin-permiso` | sesión | mensaje y enlace de regreso |

- `features/auth`: `useSession()` (TanStack Query sobre `/auth/me`),
  `RequirePermission` (componente de guardia), `lib/api-client.ts` como único
  punto de `fetch` con `credentials: 'include'`.
- El frontend oculta lo que no se puede usar; la API sigue siendo el control
  real.
- Pruebas: Vitest + Testing Library para `RequirePermission` y el filtrado de
  navegación; Playwright: iniciar sesión → elegir estancia → ver la cáscara.

## Datos de desarrollo

Script `pnpm --filter @sirai/db seed`: 7 roles, matriz de permisos, 2
estancias ficticias (`EBDI-TEST-01`, `EBDI-TEST-02`), un usuario ficticio por
rol (`docente@sirai.test`, etc.). Contraseña inicial desde `SEED_PASSWORD` en
`.env`; nunca en el código. Sin infantes ni tutores.

## Supuestos registrados

- "Supervisor Regional" del SRS se implementa como `SUPERVISOR_CENTRAL` del
  esquema hasta resolver P9 del modelo de datos.
- Bloqueo de cuenta: 5 intentos, 15 minutos (el SRS no fija cifras).
- Duración de sesión: 12 horas de inactividad (jornada de estancia) con tope
  absoluto de 72 horas (`SESSION_MAX_HOURS`); la expiración se extiende como
  máximo una vez por minuto para no escribir en cada petición.
- El bloqueo de cuenta solo se comunica (`CUENTA_BLOQUEADA`) a quien envía la
  contraseña correcta; con contraseña incorrecta la respuesta es siempre
  `CREDENCIALES_INVALIDAS`, para no revelar qué cuentas existen o están
  bloqueadas. Los intentos con correo inexistente también se auditan.
- `USUARIO_ADMINISTRAR` es global (solo ADMIN_CENTRAL) en Fase 1, por lo que
  la administración de usuarios no filtra por estancia; el filtrado se
  añadirá cuando el cliente conceda el permiso a un rol de estancia.
- `USUARIO_ADMINISTRAR` no se concede a Directora en Fase 1 (el SRS no lo
  pide); se puede ampliar vía matriz.
