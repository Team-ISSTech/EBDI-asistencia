# SIRAI

Sistema Institucional de Registro Rápido de Asistencia Infantil para las 212 Estancias de Bienestar y Desarrollo Infantil (EBDI).

Este repositorio contiene el foundation técnico del proyecto y el primer módulo de negocio: autenticación, sesiones por estancia y control de acceso por roles (RBAC). Los módulos siguientes se construyen sobre esa base.

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
- Base de datos: MySQL 8 con Drizzle ORM (ADR-004); esquema del equipo en `packages/db/sql`.
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
│   ├── db/                  # Esquema Drizzle, migraciones SQL, cliente y semilla (MySQL 8)
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
- Docker: la pila completa o solo MySQL 8 para desarrollo (ver `docker-compose.yml`).

## Ejecutar con Docker (sin Node ni pnpm)

```bash
cp .env.example .env            # revisa WEB_PORT, MYSQL_PORT y SEED_DEV_DATA
docker compose up -d            # MySQL 8 → migraciones y semilla → API → web
```

Abre `http://localhost:8080` y entra con `admin_central@sirai.test` y la
`SEED_PASSWORD` del `.env`. Las imágenes se descargan de GHCR
(`IMAGE_REGISTRY`/`IMAGE_TAG`, publicadas por `.github/workflows/images.yml`
al fusionar en `main`); para construirlas localmente usa
`docker compose up --build -d`; como la etiqueta `main` se mueve, ejecuta
`docker compose pull` para traer la versión más reciente. La web la sirve
nginx, que reenvía `/api` a la API en el mismo origen, así la cookie de sesión
no necesita CORS; la API no publica puerto propio. La semilla de desarrollo
solo corre con `SEED_DEV_DATA=true` y nunca con `NODE_ENV=production`: déjalo
en `false` en cualquier entorno compartido. `docker compose down -v` borra la
base.

La pila local corre con `NODE_ENV=development` y `COOKIE_SECURE=false`
porque va por `http://localhost`. Un despliegue real debe fijar
`NODE_ENV=production` (la imagen ya lo trae por defecto), `COOKIE_SECURE=true`
y `SEED_DEV_DATA=false`, y poner HTTPS delante de nginx; con
`NODE_ENV=production` la API se niega a arrancar sin cookies Secure o con la
llave de cifrado de ejemplo, y la semilla se niega a ejecutarse. Si delante
de nginx hay un balanceador, configura `set_real_ip_from` en
`apps/web/nginx.conf` para que la API reciba la IP real del cliente. Las
imágenes de GHCR deben marcarse como públicas en la organización; si no,
hace falta `docker login ghcr.io` antes del primer `docker compose up`.

## Inicio rápido (desarrollo con pnpm)

```bash
cp .env.example .env            # ajusta MYSQL_PORT si 3306 está ocupado
docker compose up -d mysql      # solo la base de datos
pnpm install
pnpm --filter @sirai/db migrate # aplica packages/db/sql/*.sql
pnpm --filter @sirai/db seed    # roles, permisos, 2 estancias y un usuario por rol (SEED_PASSWORD)
pnpm dev
```

Pruebas de extremo a extremo (Playwright) con API y base arriba:
`pnpm --filter @sirai/web exec playwright install chromium` una vez y después
`pnpm --filter @sirai/web test:e2e`. Todavía no corren en CI.

Usuarios de desarrollo: `docente@sirai.test`, `directora@sirai.test`,
`trabajo_social@sirai.test`, `enfermeria@sirai.test`, `medico@sirai.test`,
`supervisor_central@sirai.test` y `admin_central@sirai.test`, todos con la
contraseña `SEED_PASSWORD` del `.env`. No existen infantes ni tutores de prueba.

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
y `pnpm test`, con un servicio MySQL 8 disponible para pruebas de integración
(`TEST_DATABASE_URL`; sin esa variable las pruebas de integración se omiten con
aviso, nunca pasan en silencio).
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

1. Foundation del monorepo. ✔
2. Autenticación y RBAC: API (`feat/identity-rbac`) y pantallas base (`feat/web-shell-screens`).
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
