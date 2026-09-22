# ADR-002: Usar pnpm workspaces y Turborepo

- Estado: aceptada
- Fecha: 2026-09-21

## Contexto

El equipo mantendrá dos aplicaciones y varios paquetes TypeScript relacionados. Se necesita una instalación reproducible y ejecución coordinada de tareas sin convertir el repositorio en una sola aplicación acoplada.

## Decisión

Se utilizarán pnpm workspaces para administrar paquetes y Turborepo para orquestar tareas. Los paquetes internos usarán el namespace `@sirai/*` y referencias `workspace:*`.

## Consecuencias

- Una sola instalación administra las dependencias del proyecto.
- Las tareas se ejecutan globalmente o se filtran por aplicación.
- Cada workspace conserva su propio `package.json` y configuración.
