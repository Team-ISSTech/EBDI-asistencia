# ADR-003: Stack de implementación frente al SRS del cliente

- Estado: propuesta, pendiente de aceptación escrita del cliente o del profesor
- Fecha: 2026-10-07

## Contexto

El SRS del cliente (agosto 2026) prescribe PHP 8.2, CodeIgniter 4, MySQL/MariaDB,
PHPUnit, PHPStan, PSR-12 y GitFlow. El repositorio, acordado por el equipo en
ADR-001 y ADR-002, implementa React 19 + Vite en `apps/web` y NestJS 12 en
`apps/api`, todo en TypeScript, con base de datos pendiente.

El conflicto afecta tres cosas: la calificación del proyecto (ISO/IEC 33000 y
12207 piden entregables por fase, no una tecnología concreta, pero el SRS sí la
nombra), los entregables de F3 y F4 (repositorio con 80 % de cobertura y script
de migración) y el trabajo ya hecho por el equipo (foundation del monorepo,
ADR-001, ADR-002, pipeline de lint/typecheck/test).

Esta decisión no puede tomarla sola la arquitectura: necesita confirmación del
equipo y, de preferencia, aceptación escrita del cliente o del profesor titular.

## Opciones

### Opción A: Mantener TypeScript (React + NestJS) y documentar la desviación

- Conserva la base del monorepo ya construida y la curva de aprendizaje recorrida.
- El SRS se cumple funcionalmente al 100 %; solo cambia la tecnología.
- Cada requisito de herramientas del SRS tiene un equivalente directo (ver
  tabla). Los entregables ISO se producen igual: SRS, RTM, diagrama ER,
  prototipos, repositorio con cobertura, script de migración, manual y UAT.
- Riesgo: un evaluador que lea el SRS literalmente puede penalizar la
  desviación si no está aceptada por escrito. Mitigación: anexar este ADR y la
  tabla de equivalencias al SRS entregado en F1, con firma del cliente.
- Riesgo: el cliente podría exigir PHP para operación posterior por su equipo
  interno. Mitigación: preguntar explícitamente quién operará el sistema.

### Opción B: Migrar a PHP 8.2 + CodeIgniter 4 + MySQL/MariaDB

- Cumple el SRS al pie de la letra; cero riesgo de calificación por stack.
- Se descarta `apps/api`, `apps/web` se reescribe o se conserva como SPA
  consumiendo la API PHP (lo que ya rompería la pureza del stack prescrito).
- El equipo pierde la base del monorepo, dos ADR y su configuración; el
  tiempo de F2 y F3 se consumiría en rehacer lo que ya existe.
- La operación offline (RF-20 a RF-23: IndexedDB + Service Worker) sigue
  requiriendo JavaScript en el cliente; CodeIgniter solo cubre el servidor.
- Nadie en el equipo tiene experiencia reciente en CodeIgniter 4; el riesgo de
  entrega tardía sube.

### Opción C (descartada): Híbrido PHP para API y TypeScript para web

Duplica herramientas, pipelines y conocimientos para un equipo de cuatro
personas. No aporta ventaja sobre A ni sobre B.

## Recomendación

Opción A, condicionada a una aceptación escrita del cliente o del profesor.
Si esa aceptación no se obtiene antes del cierre de F1, el equipo debe
reevaluar la Opción B inmediatamente, antes de invertir en módulos.

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

- Si se aprueba A: ADR-001 y ADR-002 siguen vigentes; se añade ADR-004 para la
  base de datos y se incluye esta tabla como anexo del SRS entregado.
- Si se aprueba B: ADR-001, ADR-002 y este repositorio se archivan; se abre un
  repositorio nuevo con la estructura de CodeIgniter 4.
- En ambos casos la RTM (`docs/requirements/RTM.md`) debe seguir mapeando el
  100 % de los requisitos funcionales.
