# Cobertura de pruebas (RNF-09)

RNF-09 pide al menos 80 % de cobertura sobre la lógica de negocio. Por S-12 se mide sobre `packages/domain`,
`packages/auth` y los módulos de `apps/api`; no sobre componentes visuales.

## Cómo se genera

```bash
set -a && . ./.env && set +a      # TEST_DATABASE_URL incluye las pruebas de integración de la API
pnpm test
pnpm coverage:report
```

`pnpm coverage:report` (paquete `tooling/coverage`) suma las líneas, sentencias, funciones y ramas cubiertas de las tres fuentes
—suma archivo por archivo, no promedia porcentajes— y escribe `coverage/consolidado.md`. Termina con error si el total
no llega a 80 % en líneas, sentencias y funciones, o a 75 % en ramas (el mismo umbral que ya exige la API).

**Sin `TEST_DATABASE_URL` la cobertura de la API baja**, porque los repositorios de Drizzle solo se ejercitan con MySQL; el
reporte local es válido solo con la base de pruebas. CI siempre la tiene.

## En CI

El paso «coverage:report» corre después de las pruebas, publica la tabla en la página de resumen del trabajo y guarda
los reportes completos como artefacto `cobertura`. Cada paquete conserva además su propio umbral en Vitest.

## Último resultado

| Fuente | Líneas | Sentencias | Funciones | Ramas |
| --- | --- | --- | --- | --- |
| packages/domain | 100 % | 99.1 % | 98.1 % | 98.6 % |
| packages/auth | 100 % | 100 % | 100 % | 100 % |
| apps/api | 97.7 % | 95.3 % | 96.7 % | 81.9 % |
| **Total** | **97.9 %** | **95.6 %** | **96.8 %** | **83.6 %** |

Lo más flojo, por ramas: `dossiers` (72 %), `school-years` (74 %) y `sync` (76 %). Ninguno baja del umbral.
