# Mapa de arquitectura

SIRAI se construye como un monolito modular dentro de un monorepo. Compartir repositorio facilita mantener contratos compatibles, pero no mezcla la aplicación web, la API ni la persistencia.

```text
apps/web ── HTTP/REST ──> apps/api ──> packages/db ──> MySQL 8 (Drizzle ORM)
   │                          │
   ├──> packages/ui           ├──> packages/contracts
   ├──> packages/contracts    ├──> packages/domain
   ├──> packages/domain       └──> packages/auth
   └──> packages/auth
```

## Responsabilidades

- `apps/web`: presentación, accesibilidad, interacción, captura offline y comunicación del estado de sincronización.
- `apps/api`: autenticación, autorización, validación, casos de uso, auditoría, sincronización y persistencia.
- `packages/domain`: conceptos y reglas de negocio independientes de frameworks.
- `packages/contracts`: esquemas Zod y tipos de los límites HTTP.
- `packages/db`: esquema Drizzle, migraciones SQL (`sql/`, empezando por el esquema del equipo), cliente MySQL y semilla de desarrollo. Único paquete que importa el driver (decisión 4 en `decisions.md`). Modelo en `data-model.md`.
- `packages/auth`: roles, permisos y la matriz rol → permiso, fuente de verdad del sistema; expone `can()` y `permissionsFor()` sin dependencias de framework.
- `packages/ui`: primitivas visuales reutilizables exclusivamente por la web.
- `packages/config`: esquemas Zod de variables de entorno; valida al arrancar y nunca contiene secretos.

## Dependencias prohibidas

- `apps/web` hacia `apps/api` o `packages/db`.
- `apps/api` hacia `apps/web` o `packages/ui`.
- `packages/domain` hacia React, NestJS, cualquier ORM o APIs del navegador.
- Dependencias circulares.

## Mapa futuro del frontend

Las carpetas se crearán cuando empiece su fase, no antes:

```text
apps/web/src/
├── app/
├── components/
├── features/
│   ├── auth/
│   ├── attendance/
│   ├── children/
│   ├── follow-ups/
│   ├── reports/
│   └── administration/
├── offline/
├── lib/
└── styles/
```

## Mapa futuro del backend

```text
apps/api/src/
├── modules/
│   ├── health/
│   ├── identity/      # implementado: login, sesiones, cambio de estancia, usuarios
│   ├── attendance/
│   ├── children/
│   ├── follow-ups/
│   ├── reports/
│   └── administration/
├── common/            # config, database, audit, crypto, auth (guards), errors, validation, http
└── infrastructure/
```

## Identidad y autorización

Roles y permisos viven en `packages/auth`; la matriz rol → permiso en código es
la fuente de verdad y desde ella se siembra `rol_permiso`. Una asignación con
`estancia_id` concede solo en esa estancia; con `estancia_id` nulo (roles
centrales) concede en todas.

| Rol | Permisos |
| --- | --- |
| DOCENTE | ASISTENCIA_CONSULTAR, ASISTENCIA_REGISTRAR |
| TRABAJO_SOCIAL, ENFERMERIA | ASISTENCIA_CONSULTAR, SEGUIMIENTO_CONSULTAR, SEGUIMIENTO_REGISTRAR, NOTA_SENSIBLE_CONSULTAR |
| MEDICO | los de TRABAJO_SOCIAL + ALTA_MEDICA_REGISTRAR |
| DIRECTORA | los de DOCENTE y TRABAJO_SOCIAL + JORNADA_CERRAR, REPORTE_AGREGADO_CONSULTAR |
| SUPERVISOR_CENTRAL | REPORTE_AGREGADO_CONSULTAR |
| ADMIN_CENTRAL | USUARIO_ADMINISTRAR, AUDITORIA_CONSULTAR, REPORTE_AGREGADO_CONSULTAR |

Flujo en la API:

1. `AuthGuard` (global) lee la cookie `sirai_session`, resuelve la sesión en
   `sesiones` y adjunta el `AuthContext` (principal, estancia activa).
2. `PermissionsGuard` (global) exige que cada ruta declare `@Public`,
   `@Authenticated` o `@RequirePermission(código)`; sin marca, niega. El
   permiso se evalúa con `can(principal, código, { estanciaId: estanciaActiva })`.
3. Toda operación sensible escribe en `auditoria` en la misma transacción,
   con IP, user agent, id de petición y diff cifrado (AES-256-GCM).

| Ruta | Marca | Qué hace |
| --- | --- | --- |
| `POST /auth/login` | pública, con límite por IP | argon2id; bloqueo tras `LOGIN_MAX_ATTEMPTS` fallos; cookie httpOnly SameSite=Strict |
| `POST /auth/logout` | sesión | revoca la sesión |
| `GET /auth/me` | sesión | usuario, asignaciones, estancia activa y permisos resueltos |
| `POST /auth/estancia` | sesión | cambia la estancia activa (solo a una asignada) |
| `GET/POST /usuarios`, `PATCH /usuarios/:id/roles` | USUARIO_ADMINISTRAR | administración de usuarios; nadie puede quitarse su propio rol central |
| `GET /health` | pública | estado de la API y la base |

Reglas de sesión: inactividad máxima `SESSION_TTL_HOURS` (12 h) con tope
absoluto `SESSION_MAX_HOURS` (72 h); el bloqueo de cuenta solo se comunica a
quien envía la contraseña correcta, para no revelar qué cuentas existen.

## Principios

- Monolito modular antes que microservicios.
- Menor privilegio y autorización aplicada en el servidor.
- Eventos idempotentes para sincronizar asistencia capturada offline.
- Auditoría inmutable para operaciones sensibles.
- Datos personales de menores tratados como información sensible.
- Abstracciones agregadas solo cuando exista un caso real.
