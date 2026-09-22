# Mapa de arquitectura

SIRAI se construye como un monolito modular dentro de un monorepo. Compartir repositorio facilita mantener contratos compatibles, pero no mezcla la aplicación web, la API ni la persistencia.

```text
apps/web ── HTTP/REST ──> apps/api ──> packages/db ──> Persistencia por decidir
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
- `packages/db`: límite reservado para la futura implementación de persistencia. La base de datos y sus herramientas siguen sin decidirse.
- `packages/auth`: roles, permisos y políticas RBAC.
- `packages/ui`: primitivas visuales reutilizables exclusivamente por la web.
- `packages/config`: configuración compartida sin secretos.

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
│   ├── identity/
│   ├── attendance/
│   ├── children/
│   ├── follow-ups/
│   ├── reports/
│   └── administration/
├── common/
└── infrastructure/
```

## Principios

- Monolito modular antes que microservicios.
- Menor privilegio y autorización aplicada en el servidor.
- Eventos idempotentes para sincronizar asistencia capturada offline.
- Auditoría inmutable para operaciones sensibles.
- Datos personales de menores tratados como información sensible.
- Abstracciones agregadas solo cuando exista un caso real.
