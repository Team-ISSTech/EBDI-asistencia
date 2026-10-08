# SIRAI

Sistema Institucional de Registro Rápido de Asistencia Infantil para las 212 Estancias de Bienestar y Desarrollo Infantil (EBDI).

Este repositorio contiene el foundation técnico del proyecto. Todavía no implementa módulos de negocio: únicamente deja el monorepo, la aplicación web y la API listos para desarrollo.

## Equipo

| Integrante | Matrícula |
| --- | --- |
| Santiago Arista Viramontes | A01028372 |
| Juan Carlos Luz Gallardo | A01028527 |
| Isabela Valls Chavez | A01173825 |
| Fco Javier Becerra | A01027383 |

## Stack acordado

- Frontend: React, TypeScript y Vite.
- Backend: Node.js, TypeScript y NestJS.
- Base de datos y herramienta de persistencia: pendientes de decisión del equipo.
- Monorepo: pnpm workspaces y Turborepo.
- Contratos compartidos: Zod.
- UI objetivo: Tailwind CSS y shadcn/ui.
- Pruebas objetivo: Vitest y Playwright.
- Operación offline objetivo: PWA, Service Worker, IndexedDB y Dexie.

## Estructura

```text
.
├── apps/
│   ├── web/                 # Frontend: React + Vite
│   └── api/                 # Backend: NestJS
├── packages/
│   ├── ui/                  # Componentes visuales reutilizables
│   ├── domain/              # Reglas de negocio puras
│   ├── contracts/           # Esquemas Zod y contratos HTTP
│   ├── db/                  # Límite reservado para persistencia (tecnología pendiente)
│   ├── auth/                # Roles, permisos y políticas RBAC
│   ├── config/              # Configuración compartida
│   ├── eslint-config/       # Configuración compartida de ESLint
│   └── typescript-config/   # Configuración compartida de TypeScript
├── docs/
│   ├── architecture/
│   └── decisions/
└── tooling/
```

Los archivos `.gitkeep` conservan en Git los paquetes todavía vacíos. Se eliminarán cuando cada paquete tenga implementación real.

## Requisitos

- Node.js 22 LTS o posterior (`.nvmrc` fija la versión; `engines` la exige).
- pnpm 10.24.0 o compatible.
- Docker para levantar MySQL 8 en desarrollo (ver `docker-compose.yml`).

## Inicio rápido

```bash
cp .env.example .env
docker compose up -d
pnpm install
pnpm dev
```

La web queda disponible en `http://localhost:5173` y la API en `http://localhost:3000`.

También pueden ejecutarse por separado:

```bash
pnpm dev:web
pnpm dev:api
```

Comandos disponibles:

```bash
pnpm dev
pnpm build
pnpm lint
pnpm typecheck
pnpm test
```

## Compuertas de calidad

Cada pull request ejecuta en GitHub Actions (`.github/workflows/ci.yml`):
`pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm build`
y `pnpm test`, con un servicio MySQL 8 disponible para pruebas de integración.
Las reglas compartidas viven en `packages/eslint-config` (complejidad
ciclomática máxima 10, sin `console`, archivos de hasta 400 líneas,
anidamiento máximo 4) y `packages/typescript-config` (modo estricto). Un PR
con cualquiera de estas compuertas en rojo no se fusiona.

## Límites arquitectónicos

- `apps/web` no puede importar código interno de `apps/api` ni `packages/db`.
- `apps/api` no puede importar `apps/web` ni `packages/ui`.
- Web y API se comunican exclusivamente mediante HTTP REST.
- La autorización se aplica siempre en el backend.
- Solo se comparte código mediante las APIs públicas de `packages/*`.

Consulta [el mapa de arquitectura](docs/architecture/overview.md) y los ADR dentro de `docs/decisions`.

## Orden de desarrollo

1. Foundation del monorepo.
2. Autenticación y RBAC.
3. Catálogos de estancias, grupos, salas, usuarios e infantes.
4. Pase de lista.
5. Operación offline y sincronización.
6. Seguimiento de inasistencias.
7. Reportes y tableros.
8. Hardening, pruebas y despliegue.

## Contribución

- Usar TypeScript estricto.
- No almacenar secretos, credenciales ni datos reales de menores en Git.
- Evitar dependencias circulares y lógica de negocio en controladores o componentes visuales.
- Todo commit y pull request debe atribuirse únicamente al integrante que lo crea; no se agregan autores, coautores ni firmas de asistentes.
