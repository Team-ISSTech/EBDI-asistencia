# Guía para asistentes de código

Lee esto antes de tocar el repositorio. Es corta a propósito.

## Qué es

SIRAI: registro de asistencia para 212 estancias infantiles. Monorepo pnpm +
Turborepo. `apps/web` (React 19 + Vite), `apps/api` (NestJS), `packages/*`
(auth, contracts, config, db, ui, domain, eslint-config, typescript-config).
Mapa y reglas de dependencias en `docs/architecture/overview.md`; decisiones
en `docs/architecture/decisions.md`; requisitos en `docs/requirements/`.

## Comandos

`pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test` deben estar en verde
antes de abrir un PR. Las pruebas de integración necesitan
`TEST_DATABASE_URL` (base `*_test`); sin ella se omiten con aviso.

## Reglas

- Busca primero: reutiliza un helper, contrato o patrón existente antes de
  escribir uno nuevo. Coloca archivos junto a sus hermanos.
- Autorización siempre en la API; cada ruta declara `@Public`,
  `@Authenticated` o `@RequirePermission`. La lógica de negocio va en
  servicios y en `packages/domain`, nunca en controladores ni componentes.
- `apps/web` no importa `apps/api` ni `packages/db`; `apps/api` no importa
  `apps/web` ni `packages/ui`; `packages/domain` no importa frameworks.
- Datos de menores: sensibles. Nunca datos reales en el repo; columnas
  cifradas para teléfonos, diagnósticos y notas; borrado lógico; toda
  operación sensible se audita.
- Límites de ESLint: complejidad máx. 10, sin `console`, archivos de hasta
  400 líneas, anidamiento máx. 4. Funciones cortas, sin código muerto ni
  secretos.
- Pruebas primero; cada prueba debe verse fallar. Las pruebas pasan por el
  código de producción, no por objetos construidos a mano.
- Documentación en español; identificadores en inglés. Commits
  `tipo: descripción` en español (feat, fix, docs, chore, refactor, test, ci).
  PR cortos: resumen, cambios, pruebas. Sin coautores ni atribuciones de
  asistentes.
