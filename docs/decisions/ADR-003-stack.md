# ADR-003: Stack de implementación frente al SRS del cliente

- Estado: aceptada
- Fecha de aceptación: 2026-10-07 (decisión del equipo; los profesores confirmaron que el stack del SRS no es obligatorio)
- Fecha: 2026-10-07

## Contexto

El SRS del cliente (agosto 2026) nombra PHP 8.2, CodeIgniter 4, MySQL/MariaDB,
PHPUnit, PHPStan, PSR-12 y GitFlow. Los profesores confirmaron el 2026-10-07
que ese stack no es obligatorio para el proyecto; la elección es del equipo.

## Decisión

SIRAI se construye con:

- Frontend: React 19 con Vite.
- Backend: Node.js con NestJS.
- Lenguaje: TypeScript en todo el repositorio, compilado a JavaScript para
  ejecutarse en el navegador y en Node.js.
- Base de datos: MySQL 8 (ADR-004).

Motivo: decisión del equipo. Es el stack que los cuatro integrantes dominan,
permite compartir contratos y tipos entre web y API en un solo lenguaje, y
cubre con herramientas equivalentes cada requisito de calidad del SRS (tabla
abajo). No se requiere aceptación adicional del cliente ni del profesor.

El código de SIRAI es propio del equipo. Las bibliotecas de terceros (React,
NestJS, Drizzle, Zod, Vitest, Playwright, Tailwind) se usan como dependencias
instaladas desde npm, igual que en cualquier proyecto profesional; no se copia
ni se adapta ningún producto de asistencia existente. Los módulos de negocio,
las pantallas, los componentes visuales y las migraciones se escriben para
este proyecto.

### Opción rechazada: reescribir en PHP 8.2 + CodeIgniter 4

Cumpliría el SRS al pie de la letra, pero obligaría a descartar la base del
monorepo, ADR-001 y ADR-002, y a rehacer el trabajo de F1 y F2; la operación
offline seguiría requiriendo JavaScript en el cliente; y nadie en el equipo
tiene experiencia reciente en CodeIgniter 4. Al no ser obligatorio el stack
del SRS, la opción queda rechazada.

## Tabla de equivalencias de herramientas

| Requisito del SRS | Equivalente en este repositorio | Notas |
| --- | --- | --- |
| PHP 8.2 | Node.js 22 LTS + TypeScript 5.9 | Tipado estricto en todo el código. |
| CodeIgniter 4 (MVC, routing, validación) | NestJS 12 (módulos, controladores, pipes, guards) | Misma separación de capas. |
| MySQL / MariaDB | Ver ADR-004 | Drizzle soporta ambos motores. |
| PHPUnit | Vitest (unitarias e integración) + Playwright (e2e) | Reporte de cobertura con `@vitest/coverage-v8`. |
| PHPStan (análisis estático) | `tsc --strict` + typescript-eslint con reglas type-checked | Nivel comparable a PHPStan 8-9. |
| PSR-12 (estilo) | ESLint + Prettier con configuración compartida | Formato automático en pre-commit. |
| Complejidad ciclomática < 10 | Regla ESLint `complexity: 10` | Bloquea el lint en CI. |
| GitFlow | Ramas `tipo/tema` + PR a `main` protegido | Flujo simplificado; `main` siempre desplegable. |
| Composer | pnpm workspaces | Un solo lockfile para todo el monorepo. |
| Script de migración SQL (F4) | Migraciones de Drizzle (`drizzle-kit generate`) | Produce SQL plano versionado en `packages/db`. |
| Cifrado AES-256 en reposo | `node:crypto` (AES-256-GCM) con llave en variable de entorno | Ver RNF en `docs/requirements/SRS.md`. |

## Consecuencias

- ADR-001 y ADR-002 siguen vigentes; ADR-004 fija la base de datos.
- La RTM (`docs/requirements/RTM.md`) mapea el 100 % de los requisitos
  funcionales al stack elegido.
- Los entregables ISO que nombran herramientas del SRS se presentan con su
  equivalente de la tabla anterior.
