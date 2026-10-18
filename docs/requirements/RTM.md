# RTM: Matriz de trazabilidad de requisitos

Mapea cada requisito de `SRS.md` al paquete o módulo del monorepo que lo
implementará, al tipo de verificación que lo comprobará y a su estado actual.
Las rutas corresponden al plan de arquitectura (`docs/architecture/overview.md`,
`docs/architecture/decisions.md`); la mayoría todavía no existe en el repositorio y se creará
cuando inicie su fase. El estado "pendiente" significa que no hay rama abierta;
"parcial" identifica requisitos cuya base existe pero falta una parte concreta (se nombra
en la misma celda) y "en curso" nombra la rama donde se trabaja. Esta matriz se actualiza
en cada PR que cierre o abra un requisito. Los requisitos marcados "(Fase 2)" en el SRS
aparecen "en curso" cuando su base técnica (matriz de permisos, roles) se
construye desde la Fase 1, según el supuesto S-04 del SRS.

## Requisitos funcionales

| ID | Requisito | Paquete o módulo | Verificación | Estado |
| --- | --- | --- | --- | --- |
| RF-01 | Roles de Fase 1 | `packages/auth` (matriz rol-permiso), `apps/api/src/modules/identity` | unitaria Vitest | implementado en `main` |
| RF-02 | Roles de Fase 2 | `packages/auth`, `apps/api/src/modules/identity` | unitaria Vitest | implementado en `main` |
| RF-03 | Sesión acotada por estancia | `apps/api/src/modules/identity` (sessions, guards) | integración Vitest + MySQL | implementado en `main` |
| RF-04 | Login con correo y contraseña | `apps/api/src/modules/identity` (login), `apps/web/src/features/auth` | integración Vitest + MySQL, e2e Playwright | implementado en `main` |
| RF-05 | Bloqueo por intentos fallidos | `apps/api/src/modules/identity`, `packages/config` (umbral) | integración Vitest + MySQL | implementado en `main` |
| RF-06 | Permisos de Docente | `packages/auth` (matriz rol-permiso), `apps/api/src/modules/identity` (guards) | unitaria Vitest, integración Vitest + MySQL | implementado en `main` |
| RF-07 | Permisos de Trabajo Social/Enfermería | `packages/auth`, `apps/api/src/modules/identity` | unitaria Vitest, integración Vitest + MySQL | implementado en `main` |
| RF-08 | Permisos de Médico | `packages/auth`, `apps/api/src/modules/identity` | unitaria Vitest, integración Vitest + MySQL | implementado en `main` |
| RF-09 | Permisos de Directora | `packages/auth`, `apps/api/src/modules/identity` | unitaria Vitest, integración Vitest + MySQL | implementado en `main` |
| RF-10 | Supervisor Central solo agregados | `packages/auth`, `apps/api/src/modules/identity`, `apps/api/src/modules/reports` | integración Vitest + MySQL | implementado en `main` (permisos, tablero y exportaciones solo agregados, con alcance por región) |
| RF-11 | Admin Central: usuarios, roles y auditoría | `packages/auth`, `apps/api/src/modules/identity`, `apps/api/src/modules/administration` | integración Vitest + MySQL | parcial: usuarios y roles listos; falta la pantalla de consulta de la bitácora |
| RF-12 | Pase de lista en menos de 3 clics | `apps/web/src/features/attendance` | e2e Playwright | implementado en `main` (pase de lista en dos clics; falta la prueba e2e en navegador) |
| RF-13 | Escaneo QR/código de barras | `apps/web/src/features/attendance` | unitaria Vitest (pantalla con lector simulado y cámara simulada) | parcial: el cliente pide un lector para credenciales de infantes y tutores autorizados; está implementado el ingreso de infantes por matrícula (lector, cámara o captura manual). Faltan las credenciales de tutores y la salida, que el documento no define (S-22), y no hay e2e Playwright |
| RF-14 | Estados de asistencia | `packages/domain` (estados y reglas), `apps/api/src/modules/attendance` | unitaria Vitest | implementado en `main` |
| RF-15 | Jornada por estancia, fecha y turno | `packages/domain`, `apps/api/src/modules/attendance`, `packages/db` (índice único) | unitaria Vitest, integración Vitest + MySQL | implementado en `main` |
| RF-16 | Tablero semaforizado en tiempo real | `apps/api/src/modules/reports`, `apps/web/src/features/reports` | integración Vitest + MySQL, e2e Playwright | implementado en `main` (umbrales del semáforo por confirmar, S-15) |
| RF-17 | Exportación Excel y PDF por periodo | `apps/api/src/modules/reports` | integración Vitest + MySQL | implementado en `main` (cortes por confirmar, S-16) |
| RF-18 | Reportes anonimizados para roles centrales | `apps/api/src/modules/reports`, `packages/auth` | integración Vitest + MySQL | implementado en `main` |
| RF-19 | Expediente PDF para traslados | `apps/api/src/modules/reports`, `apps/api/src/modules/children` | integración Vitest + MySQL | implementado en `main` (sello de integridad, no e.firma: S-17) |
| RF-20 | Cola IndexedDB con Service Worker | `apps/web/src/offline` (Dexie/IndexedDB, Service Worker) | unitaria Vitest, e2e Playwright | pendiente |
| RF-21 | Sincronización automática al reconectar | `apps/web/src/offline`, endpoint de sync en `apps/api` | e2e Playwright | parcial: el servidor recibe y aplica lotes en orden al reconectar; falta el cliente que los envía solo |
| RF-22 | Eventos idempotentes | endpoint de sync en `apps/api`, `packages/db` (`uuid_cliente`, `uuid_operacion`) | integración Vitest + MySQL | parcial: `POST /sincronizacion` idempotente por UUID de operación con acuse guardado; falta la cola del lado del navegador |
| RF-23 | Sin pérdida de datos offline | `apps/web/src/offline`, endpoint de sync en `apps/api` | e2e Playwright | parcial: el servidor no pierde ni duplica lo capturado (acepta captura tardía si se hizo antes del cierre); falta que la tablet conserve la cola |
| RF-24 | Ticket automático por ausencia al cierre 09:00 | `apps/api/src/modules/follow-ups`, `packages/domain` | unitaria Vitest, integración Vitest + MySQL | implementado en `main` (solo jornadas matutinas; el SRS no define el vespertino) |
| RF-25 | Contacto telefónico obligatorio | `apps/api/src/modules/follow-ups`, `apps/web/src/features/follow-ups` | integración Vitest + MySQL | implementado en `main` |
| RF-26 | Clasificación de causa | `packages/domain`, `apps/api/src/modules/follow-ups` | unitaria Vitest | implementado en `main` |
| RF-27 | NO_LOC: segundo intento y alerta | `apps/api/src/modules/follow-ups` | integración Vitest + MySQL | parcial: segundo intento a las 4 h y alerta en pantalla; falta el aviso saliente a los contactos |
| RF-28 | Fecha estimada de retorno | `apps/api/src/modules/follow-ups`, `apps/web/src/features/follow-ups` | integración Vitest + MySQL | implementado en `main` |
| RF-29 | Candado médico | `packages/domain`, `apps/api/src/modules/follow-ups`, `apps/api/src/modules/attendance` | unitaria Vitest, integración Vitest + MySQL | implementado en `main` |
| RF-30 | Alta médica por Médico | `apps/api/src/modules/follow-ups`, `packages/auth` | integración Vitest + MySQL | implementado en `main` |
| RF-31 | Catálogo de estancias | `apps/api/src/modules/administration`, `apps/web/src/features/administration` | integración Vitest + MySQL | implementado (alta, edición y baja lógica auditadas; la baja se bloquea con inscritos o jornadas abiertas) |
| RF-32 | Catálogo de salas/grupos | `apps/api/src/modules/administration`, `apps/web/src/features/administration` | integración Vitest + MySQL | implementado (alta, edición, desactivación y baja lógica; capacidad, turno y sala llena en la inscripción) |
| RF-33 | Catálogo de infantes | `apps/api/src/modules/children`, `apps/web/src/features/children` | integración Vitest + MySQL | implementado (alta, edición y eliminación lógica; la baja de la inscripción es el movimiento de RF-35) |
| RF-34 | Catálogo de tutores y relación con infantes | `apps/api/src/modules/children`, `apps/web/src/features/children` | integración Vitest + MySQL | implementado (alta, edición con teléfono recifrado, permisos del vínculo y desvinculación con historial) |
| RF-35 | Inscripciones y movimientos | `apps/api/src/modules/children`, `packages/domain` | integración Vitest + MySQL | implementado (alta, cambio de sala, baja y traslado con recepción en la estancia de destino; supuesto S-21) |
| RF-36 | Consentimiento del tutor | `apps/api/src/modules/children`, `apps/web/src/features/children` | integración Vitest + MySQL | implementado en `main` (la versión del aviso la fija el servidor; falta confirmar la versión real) |
| RF-37 | API con Bearer tokens para sistemas institucionales (A21A, #52) | `apps/api/src/modules/integration` (por crear), `packages/db` (tabla de tokens), `packages/auth` | integración Vitest + MySQL | pendiente |
| RF-38 | Cambio de contraseña temporal y voluntario | `apps/api/src/modules/identity`, `apps/web/src/features/auth`, `packages/contracts` | integración Vitest + MySQL, unitaria Vitest | implementado (cambio obligatorio con temporal, voluntario, caducidad y restablecimiento por administrador; supuesto S-19) |

## Requisitos no funcionales

| ID | Requisito | Paquete o módulo | Verificación | Estado |
| --- | --- | --- | --- | --- |
| RNF-01 | AES-256 en reposo | `apps/api/src/common` (encryption service), `packages/db` (columnas `*_cifrado`) | unitaria Vitest, integración Vitest + MySQL | implementado en `main` (teléfono, discapacidad, notas, observaciones médicas y bitácora) |
| RNF-02 | Auditoría inmutable con diff | `apps/api/src/common` (audit interceptor), `packages/db` (tabla `auditoria`, solo INSERT) | integración Vitest + MySQL, revisión de código | implementado en `main` (triggers de la migración 0002) |
| RNF-03 | Auditoría de lecturas confidenciales | `apps/api/src/common` (audit interceptor), `apps/api/src/modules/follow-ups` | integración Vitest + MySQL | implementado en `main` (padrón, tutores, teléfono, notas, seguimientos, expedientes y exportaciones) |
| RNF-04 | Borrado lógico, nunca DELETE | `packages/db` (Drizzle, MySQL 8), repositorios de `apps/api` | integración Vitest + MySQL, revisión de código | parcial: estancias, salas, infantes, inscripciones y vínculos infante-tutor ya se dan de baja con `deleted_at`/`deleted_by`; falta una operación de baja de tutores y de usuarios |
| RNF-05 | Retención: ciclo activo, 5 años archivado | `packages/db`, `apps/api/src/modules/administration` | integración Vitest + MySQL, revisión de código | parcial: tabla `ciclos_escolares` y jornadas ligadas a su ciclo; falta archivar y depurar |
| RNF-06 | Autorización en backend | `apps/api/src/modules/identity` (guards), `packages/auth` | integración Vitest + MySQL, revisión de código | parcial: guard cerrado por defecto y permiso declarado en cada ruta; falta la revisión de seguridad (A23) |
| RNF-07 | Sin datos reales de menores en el repositorio | repositorio completo, `packages/db` (seeds sintéticos) | revisión de código | implementado en `main` (semillas sintéticas; sin infantes ni tutores reales) |
| RNF-08 | p95 < 1.5 s con 212 estancias | `apps/api/src/modules/attendance`, `apps/api/src/modules/follow-ups`, `packages/db` (índices) | medición de carga | parcial: tablero con 212 estancias medido en menos de 1.5 s; falta la prueba de 212 peticiones concurrentes |
| RNF-09 | Cobertura 80 % en lógica de negocio | `packages/domain`, `packages/auth`, `apps/api/src/modules/*` | unitaria Vitest, integración Vitest + MySQL (reporte de cobertura) | parcial: umbral de 80 % en cada paquete; falta el reporte consolidado |
| RNF-10 | Complejidad ciclomática < 10 | `packages/eslint-config` (regla `complexity: 10`) | inspección de ESLint | implementado en `main` |
| RNF-11 | Sin `console` ni código muerto | `packages/eslint-config` (`no-console`, `no-unused-vars`) | inspección de ESLint | implementado en `main` |
| RNF-12 | Compuertas de calidad en CI | `.github/workflows`, `tooling/` | revisión de código | implementado en `main` |
| RNF-13 | F1: SRS y RTM | `docs/requirements` | revisión de código | implementado en `main` |
| RNF-14 | F2: ER y prototipos de UI | `docs/architecture/data-model.md`, `apps/web/src/features/*` | revisión de código | parcial: modelo entidad-relación en `data-model.md`; faltan los prototipos UI/UX con revisión de accesibilidad |
| RNF-15 | F3: repositorio con 80 % de cobertura | repositorio completo | unitaria Vitest, integración Vitest + MySQL, e2e Playwright | pendiente |
| RNF-16 | F4: script de migración y manual | `packages/db` (migraciones Drizzle), `docs/` (manual de instalación) | integración Vitest + MySQL, revisión de código | parcial: migraciones repetibles con `pnpm --filter @sirai/db migrate`; falta el manual de instalación |
| RNF-17 | F5: UAT con 3 a 5 estancias piloto | `apps/web`, `apps/api` | e2e Playwright | pendiente |

## Resumen

| Métrica | Valor |
| --- | --- |
| Requisitos funcionales (RF) | 38 |
| Requisitos no funcionales (RNF) | 17 |
| Total | 55 |
| Mapeados a paquete o módulo | 55 (100 %) |
| Implementados | 38 |
| Parciales | 13 |
| Pendientes | 4 |
