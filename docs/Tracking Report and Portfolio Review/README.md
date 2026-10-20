# Tracking Report and Portfolio Review

Informe de seguimiento de SIRAI al **2026-10-20** (día 14 desde el primer
trabajo de código, 2026-10-07).


## De dónde salen los datos

- Estado de requisitos: `docs/requirements/RTM.md` (55 requisitos).
- Actividad: historial de git (127 commits, 49 PR fusionados).
- Calidad: `coverage/consolidado.md` y `docs/operations/*`.

## Alcance de los datos

1. El repositorio no guarda la línea base (fechas y presupuesto por
   actividad); esa información está en el GitHub Project y en *SIRAI Project
   Plan EN*, que no se consultaron. El SPI se calcula con la línea base
   indicada en el tablero.
2. No hay datos de costo ni de horas, por lo que no se calcula CPI. En su
   lugar se reporta un indicador de eficiencia por PR y commits.
3. "Implementado" significa cumplido en `main` según la RTM. El UAT
   (RNF-17) no se ha realizado, así que ningún requisito tiene aceptación
   del cliente.
