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
| P2 | `deleted_by` (FK a `usuarios`, nulo) junto a cada `deleted_at` (migración 0003). |
| P3 | Inmutabilidad de `auditoria` por triggers más usuario de ejecución con solo `INSERT`/`SELECT`; se documenta en el manual de instalación. |
| P4 | Los diagnósticos van en las columnas cifradas existentes (`incidencias_asistencia`, `altas_medicas`); sin expediente médico en Fase 1. |
| P5 | `infantes.grupo_discapacidad` pasa a columna cifrada; los reportes agrupan por `tiene_discapacidad` (migración 0003). |
| P6 | Todo contacto de emergencia es un tutor (`infante_tutor.es_contacto_emergencia`). |
| P7 | Tabla `sesiones` (migración 0001). |
| P8 | `ciclos_escolares` con `ACTIVO`/`ARCHIVADO`; la retención de 5 años se aplica por ciclo (migración 0003). |
| P9 | Un solo rol `SUPERVISOR_CENTRAL` con alcance por región (`usuario_rol.region`, migración 0003). |
| P10 | Los permisos de cada módulo se agregan al iniciarlo, con su prueba en la matriz. |
| P11 | Estados en `VARCHAR`; valores válidos en `packages/domain` y `CHECK` en la migración de cada módulo. |

Las migraciones de P2, P5, P8 y P9 se abren con el módulo de catálogos; el SQL
original del equipo (`0000`) no se modifica.

## Bearer tokens para sistemas externos (RF-37)

- **JWT solo para máquinas.** Las personas siguen con sesiones en servidor y
  cookie `httpOnly` (P7): se revocan al instante, se auditan y cambian de
  estancia sin emitir otro token. Un JWT sin estado no daría nada de eso.
- **Flujo de credenciales de cliente.** El administrador central registra un
  sistema (nombre y alcances); recibe un `clientId` y un `clientSecret` que se
  muestran una vez y se guardan con hash (argon2id). El sistema los cambia en
  `POST /integracion/token` por un JWT HS256 de 15 minutos (`INTEGRATION_TOKEN_MINUTES`).
- **Revocación inmediata.** El JWT solo trae el sistema y los alcances que pidió;
  en cada petición la API vuelve a leer el sistema y exige que siga activo y que
  conserve cada alcance. Revocar o recortar surte efecto sin esperar a que el
  token venza.
- **Algoritmo, emisor, destinatario y versión de llave fijos.** Se rechaza
  `alg: none` y cualquier otro algoritmo. La llave es `API_TOKEN_SECRET`
  (obligatoria en producción y distinta de `DATA_ENCRYPTION_KEY`); fuera de
  producción se deriva de la de cifrado.
- **Dos mundos separados.** Una ruta con `@RequireScope` solo acepta el Bearer
  de un sistema; el resto solo acepta la cookie de una persona. Un token de
  sistema no obtiene permisos de un rol ni una sesión abre la API de integración.
- **Alcances aparte de los permisos.** `INTEGRATION_SCOPES` en `packages/auth`
  es un catálogo cerrado e independiente de `PERMISSION_CODES`.
- **Auditoría.** `auditoria.sistema_id` nombra al sistema como actor (migración
  0015): alta, revocación, cada token emitido o rechazado y cada consulta.
- **Límite de peticiones** por sistema y minuto en la memoria de cada réplica de la
  API (`INTEGRATION_RATE_LIMIT_PER_MINUTE`); con varias réplicas el tope real es
  el límite por el número de réplicas.

## Retención por ciclo escolar (RNF-05)

- **Archivar = solo lectura.** Abrir el ciclo nuevo archiva el actual en la misma
  transacción. Solo se puede si todo lo suyo está cerrado, así que lo ya cerrado
  no se vuelve a abrir; el único camino de escritura que quedaba, una captura sin
  conexión tardía (S-20), se rechaza si el ciclo de la jornada está archivado.
- **Un solo ciclo activo**, garantizado por la base (columna generada con índice
  único, migración 0016): el alta de infantes y de jornadas usa «el» ciclo activo.
- **Depurar = vaciar, no borrar.** Choca con RNF-04 (nunca `DELETE`): la depuración
  pone en `NULL` las columnas cifradas sensibles de los seguimientos del ciclo
  (teléfono y notas de los contactos, observaciones de las altas médicas) y marca
  el ciclo con quién y cuándo. Las filas, los conteos y la bitácora se conservan.
- **Condiciones de la depuración:** ciclo archivado, 5 años cumplidos
  (`RETENTION_YEARS` en `packages/domain`), sin depurar antes, acción aparte del
  administrador central y escribiendo la clave del ciclo. Nunca es automática.
- **Fuera de alcance:** los infantes y los tutores no pertenecen a un ciclo y no se
  depuran por esta vía; la bitácora no se depura.

## Modo sin conexión del navegador (RF-20 a RF-23)

- **Guardar primero, enviar después.** Una captura se intenta enviar al servidor con su ruta
  de siempre y, si no se supo si llegó (sin red, tiempo agotado, servidor caído, sesión vencida),
  se guarda en la cola de la tablet y se envía por `POST /sincronizacion`. Un rechazo definitivo
  (datos inválidos, sin permiso, jornada cerrada) no se guarda: se muestra. Como cada marca
  lleva su UUID desde el principio, reenviar lo que quizá sí llegó nunca duplica.
- **Nada se pierde en silencio.** Una operación sale de la cola solo cuando el servidor la
  aplica. Lo rechazado, total o parcialmente, queda en «Capturas por revisar» con su motivo
  hasta que alguien lo reconcilie con el formato físico y lo descarte.
- **IndexedDB cifrado y por persona.** Dexie sobre IndexedDB; el contenido va con AES-GCM y una
  llave no extraíble. Cada captura pertenece a quien la hizo y solo se envía con su sesión.
  No se guardan teléfonos ni notas para leer sin conexión.
- **Copias de lectura** (sesión, jornada, lista, bandeja, tutores): cifradas, por persona, de una
  semana como máximo y borradas al cerrar sesión. Un 401 nunca se tapa con una copia.
- **TanStack Query con `networkMode: 'always'`.** Por defecto pausa consultas y mutaciones cuando
  el navegador cree que no hay red, que es justo cuando hay que servir la copia o guardar en la
  tablet; `navigator.onLine` tampoco es fiable (portales cautivos).
- **Service Worker solo para la aplicación**, con `vite-plugin-pwa` (Workbox, `generateSW`): se guarda el
  código, los estilos y las tipografías. Las respuestas de la API nunca pasan por él. Con `registerType:
  'prompt'` una versión nueva espera a que se cierren las pestañas, para no recargar a media captura.
- **Verificación en navegador real** con Playwright (`docs/operations/pruebas-sin-conexion.md`);
  corre en CI en un trabajo aparte («e2e») que levanta MySQL, la API y la web compilada, sin reintentos (las pruebas crean datos únicos).

## Avisos a contactos de emergencia por WhatsApp (RF-27)

- **Bandeja de salida en la base de datos.** El segundo intento fallido deja un aviso pendiente por
  cada contacto de emergencia, en la misma transacción que el intento y su auditoría. Un proceso
  aparte los envía. Así un fallo de WhatsApp nunca pierde el intento de contacto ni el aviso, y la
  restricción única (seguimiento, tutor) impide avisar dos veces al mismo contacto.
- **El aviso no guarda texto ni teléfono.** El texto es fijo (`EMERGENCY_NOTICE_TEXT`) y el número se
  lee cifrado del tutor al enviar; ni la bitácora ni los registros del servidor lo contienen. De un
  error de Meta solo se conserva el código, porque su mensaje puede repetir el número.
- **Canal intercambiable.** `MessageChannel` aísla a WhatsApp Cloud API. Sin cuenta configurada el canal
  está apagado y la cola no se toca; los avisos esperan en la base.
- **Reserva contra doble envío.** Antes de enviar, el aviso se reserva 5 minutos con un UPDATE
  condicional, así varias instancias de la API, o un proceso que cae a media vuelta, no lo mandan dos veces.
- **Reintentos:** hasta 3 intentos con espera de 5 y 10 minutos; después queda FALLIDO y se audita.

## Rendimiento con 212 estancias (RNF-08)

- **Una subconsulta por fila no escala.** El candado médico de la lista se calculaba con un `EXISTS` correlacionado que recorría
  todos los seguimientos abiertos de la red por cada infante. Ahora se consulta una vez por lista, partiendo de los infantes
  pedidos. La regla (el candado sigue al infante, no a la inscripción) no cambió.
- **Una sentencia por tabla en los lotes.** Guardar el pase de lista inserta los registros y la bitácora con un INSERT multifila
  cada uno. `AuditService.recordMany` es la forma de auditar lotes.
- **Pool configurable** (`DB_POOL_SIZE`, 25). La API es un solo proceso de Node; escalar es añadir instancias, cuidando `max_connections`.
- **La bitácora de lecturas sensibles se queda síncrona**: cada una se confirma antes de responder (RNF-02).
