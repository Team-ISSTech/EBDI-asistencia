# Decisiones de arquitectura

Registro breve de las decisiones que fijan la forma del proyecto. Cada una
indica fecha, contexto y consecuencias; se agregan nuevas al final.

## 1. Web y API separadas dentro del monorepo (2026-09-21)

`apps/web` (React + Vite) y `apps/api` (NestJS) son aplicaciones
independientes que solo se comunican por HTTP REST; los contratos viven en
`packages/contracts`. La web nunca importa la API ni `packages/db`; la API
nunca importa la web ni `packages/ui`. Así se prueban, construyen y
despliegan por separado, y la autorización queda siempre del lado del
servidor.

## 2. pnpm workspaces y Turborepo (2026-09-21)

Un solo `pnpm install` administra todo; Turborepo orquesta `lint`,
`typecheck`, `build` y `test`. Los paquetes internos usan el namespace
`@sirai/*` con `workspace:*`.

## 3. Stack: React + NestJS en TypeScript (2026-10-07)

- Frontend: React 19 con Vite. Backend: Node.js con NestJS. Lenguaje:
  TypeScript en todo el repositorio, compilado a JavaScript.
- El SRS del cliente nombraba PHP 8.2 / CodeIgniter 4 / MySQL. Los profesores
  confirmaron que ese stack no es obligatorio; la elección es del equipo y no
  requiere aceptación adicional. Reescribir en PHP se descartó: tiraba la base
  ya construida, la operación offline igual necesita JavaScript y nadie en el
  equipo trabaja CodeIgniter.
- El código de SIRAI es propio. Las bibliotecas (React, NestJS, Drizzle, Zod,
  Vitest, Playwright, Tailwind) son dependencias de npm; no se copia ningún
  producto de asistencia existente.

Equivalencias con las herramientas que nombra el SRS, para los entregables
ISO/IEC 12207:

| SRS | Aquí |
| --- | --- |
| PHP 8.2 | Node.js 22 LTS + TypeScript 5.9 |
| CodeIgniter 4 | NestJS 12 |
| MySQL / MariaDB | MySQL 8 (decisión 4) |
| PHPUnit | Vitest (unitarias e integración) + Playwright (e2e) |
| PHPStan | `tsc --strict` + typescript-eslint con reglas type-checked |
| PSR-12 | ESLint + Prettier compartidos |
| Complejidad ciclomática < 10 | regla ESLint `complexity: 10` |
| GitFlow | ramas `tipo/tema` + PR a `main` |
| Composer | pnpm workspaces |
| Script de migración (F4) | SQL versionado en `packages/db/sql` |
| AES-256 en reposo | `node:crypto` AES-256-GCM con llave en variable de entorno |

## 4. Persistencia: MySQL 8 + Drizzle ORM (2026-10-07)

- Motor: MySQL 8. El esquema que el equipo diseñó está escrito para MySQL y es
  el mismo motor del SRS, así que el script de migración de F4 se entrega sin
  traducir. PostgreSQL se consideró (índices parciales, RLS, `jsonb`) y se
  descartó por no justificar rehacer el ER; se revisará solo si los reportes
  sobre 212 estancias no alcanzan p95 < 1.5 s.
- ORM: Drizzle. Genera SQL explícito, es solo TypeScript y sus migraciones son
  SQL plano. Prisma y TypeORM se descartaron por su motor propio y por meter
  decoradores en las entidades.
- Reglas: `packages/db` es el único paquete que conoce el motor; la API accede
  por repositorios, nunca desde controladores; `packages/domain` no importa
  ORM; las tablas sensibles usan borrado lógico (`deleted_at`, `deleted_by`) y
  la API nunca ejecuta `DELETE` sobre ellas; `auditoria` solo recibe `INSERT`
  (triggers en la migración 0002 y usuario de BD restringido); las columnas
  cifradas llevan prefijo de versión de llave.

Decisiones sobre el esquema del equipo (preguntas P1..P11 de
`data-model.md`):

| P | Decisión |
| --- | --- |
| P1 | Diseño normalizado (`jornadas_asistencia` + `asistencias`); sin desnormalizar `infante_id`. |
| P2 | `deleted_by` (FK a `usuarios`, nulo) junto a cada `deleted_at`. |
| P3 | Inmutabilidad de `auditoria` por triggers más usuario de ejecución con solo `INSERT`/`SELECT`; se documenta en el manual de instalación. |
| P4 | Los diagnósticos van en las columnas cifradas existentes (`incidencias_asistencia`, `altas_medicas`); sin expediente médico en Fase 1. |
| P5 | `infantes.grupo_discapacidad` pasa a columna cifrada; los reportes agrupan por `tiene_discapacidad`. |
| P6 | Todo contacto de emergencia es un tutor (`infante_tutor.es_contacto_emergencia`). |
| P7 | Tabla `sesiones` (migración 0001). |
| P8 | `ciclos_escolares` con `ACTIVO`/`ARCHIVADO`; la retención de 5 años se aplica por ciclo. |
| P9 | Un solo rol `SUPERVISOR_CENTRAL` con alcance por región (`usuario_rol.region`). |
| P10 | Los permisos de cada módulo se agregan al iniciarlo, con su prueba en la matriz. |
| P11 | Estados en `VARCHAR`; valores válidos en `packages/domain` y `CHECK` en la migración de cada módulo. |

Las migraciones de P2, P5, P8 y P9 se abren con el módulo de catálogos; el SQL
original del equipo (`0000`) no se modifica.
