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
- `packages/db`: esquema Drizzle, migraciones SQL (`sql/`, empezando por el esquema del equipo), cliente MySQL y semilla de desarrollo. Único paquete que importa el driver (ADR-004). Modelo en `data-model.md`.
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

## Autorización en la API

1. `AuthGuard` (global) lee la cookie `sirai_session`, resuelve la sesión en
   `sesiones` y adjunta el `AuthContext` (principal, estancia activa).
2. `PermissionsGuard` (global) evalúa `@RequirePermission(código)` con
   `can(principal, código, { estanciaId: estanciaActiva })` de `packages/auth`.
3. Los servicios aplican además el alcance de datos (por ejemplo, un
   administrador de estancia solo lista y asigna dentro de su estancia).
4. Toda operación sensible escribe en `auditoria` mediante `AuditService`, con
   IP, user agent, id de petición y diff cifrado (AES-256-GCM).

## Principios

- Monolito modular antes que microservicios.
- Menor privilegio y autorización aplicada en el servidor.
- Eventos idempotentes para sincronizar asistencia capturada offline.
- Auditoría inmutable para operaciones sensibles.
- Datos personales de menores tratados como información sensible.
- Abstracciones agregadas solo cuando exista un caso real.
