# Prueba de carga (RNF-08)

RNF-08 pide p95 < 1.5 s en las operaciones de asistencia y seguimiento con 212 estancias concurrentes. Según S-13, se mide
la latencia de la API, sin la red del cliente.

## Qué simula

`apps/api/load/` contiene una semilla sintética y un ejecutor. Todo inventado: no hay datos reales de menores.

- **Semilla** (`pnpm --filter @sirai/api load:seed`): 212 estancias con 2 salas, 40 infantes y tres cuentas cada una
  (directora, docente y trabajo social), una jornada pasada cerrada con 3 faltas por estancia y sus seguimientos
  abiertos: 8 480 infantes, 640 cuentas, 636 seguimientos. Vacía la base: exige que termine en `_test`.
- **Ejecutor** (`pnpm --filter @sirai/api load:run`): las 212 estancias trabajan **a la vez y sin pausas**, que es peor que
  la realidad. Cada una abre la jornada, pasa lista a sus 40 infantes en una sola petición, manda una captura de
  reconexión por `/sincronizacion`, y durante 5 rondas consulta la lista, trabaja la bandeja de seguimientos,
  registra una llamada y lee las notas. Mientras tanto, el tablero central se consulta 5 veces.
- Termina con código 1 si alguna operación de asistencia o seguimiento tiene p95 > 1 500 ms o un solo error. Las
  variables `LOAD_ESTANCIAS`, `LOAD_ROUNDS`, `LOAD_P95_MS`, `LOAD_API_URL` y `LOAD_LOGIN_CONCURRENCY` ajustan la prueba.

## Cómo correrla

```bash
set -a && . ./.env && set +a
pnpm --filter @sirai/api build
pnpm --filter @sirai/api load:seed            # vacía TEST_DATABASE_URL (…_test) y la llena
PORT=3000 DATABASE_URL=$TEST_DATABASE_URL LOGIN_RATE_LIMIT_PER_MINUTE=100000 FOLLOW_UP_JOB_SECONDS=0 \
  EMERGENCY_NOTICE_JOB_SECONDS=0 node apps/api/dist/main.js &
pnpm --filter @sirai/api load:run
```

La semilla debe repetirse antes de cada corrida: el ejecutor abre la jornada de hoy y una segunda corrida chocaría. No corre en CI
(necesita MySQL y varios minutos).

## Lo que se encontró

Primera corrida, con el código anterior y el pool de 10 conexiones: **p95 de 3.2 a 3.9 s** en la lista, la bandeja, guardar y llamar.
MySQL estaba al 500-700 % de CPU: el cuello de botella era la base, no la API.

1. **La lista de asistencia hacía una subconsulta por infante** (candado médico) que recorría todos los seguimientos abiertos de la red:
   ~18 000 filas examinadas por consulta. Ahora se parte de los infantes de la lista y se usan los índices por infante y por asistencia.
   La consulta de la lista pasó de ~200 ms a menos de 5 ms en promedio.
2. **Guardar el grupo completo costaba 2 sentencias por infante** (registro y bitácora). Ahora es un INSERT para los registros y otro
   para la bitácora (`AuditService.recordMany`), dentro de la misma transacción. Una prueba de integración cuenta las sentencias.
3. **El pool de 10 conexiones era el techo.** Ahora se configura con `DB_POOL_SIZE` (25 por defecto).

## Resultado

Corrida representativa tras los cambios (pool de 25), tiempos en milisegundos:

| Operación | Peticiones | Errores | p50 | p95 | p99 | Máx |
| --- | --- | --- | --- | --- | --- | --- |
| abrir jornada | 212 | 0 | 635 | 1298 | 1334 | 1351 |
| lista de asistencia | 1272 | 0 | 644 | 850 | 883 | 1369 |
| guardar asistencia (40 infantes) | 212 | 0 | 1096 | 1158 | 1202 | 1207 |
| sincronizar capturas | 212 | 0 | 1117 | 1223 | 1241 | 1242 |
| bandeja de seguimientos | 1060 | 0 | 564 | 729 | 795 | 827 |
| registrar llamada | 1060 | 0 | 742 | 910 | 982 | 1006 |
| notas del seguimiento | 1060 | 0 | 539 | 653 | 685 | 788 |

**Cumple en 2 de 3 corridas**: en la tercera, guardar, sincronizar y llamar quedaron entre 1.44 y 1.56 s. El resultado es
**ajustado y depende del equipo**: se midió en un portátil donde el generador de carga, la API y MySQL (en Docker) compiten por
los mismos núcleos, con MySQL confirmando cada transacción al disco.

## Lo que queda

- **Repetir la prueba en la infraestructura real** (o una equivalente, con el generador en otra máquina). Si guardar y sincronizar
  siguen rozando 1.5 s, el siguiente paso es una segunda instancia de la API detrás del balanceador (cada una con su pool;
  la suma de pools debe caber en `max_connections` de MySQL). No se midió con dos instancias.
- **Cada lectura de datos sensibles escribe en la bitácora** (RNF-02) con su propia confirmación a disco: es la sentencia que más tiempo
  acumula. Se mantiene así porque lo exige el requisito; si hiciera falta, la salida sería confirmar la bitácora por lotes.
- **Inicio de sesión:** con 20 inicios a la vez tarda ~2 s (argon2id). No entra en RNF-08 y es razonable porque nadie inicia sesión
  en el mismo segundo; con 636 a la vez se llega a más de 20 s.
- El tablero central tarda ~1 s con 212 estancias; se mide pero no entra al veredicto (no es captura ni seguimiento).
