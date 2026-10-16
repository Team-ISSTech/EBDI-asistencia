# RTM: Matriz de trazabilidad de requisitos

Mapea cada requisito de `SRS.md` al paquete o módulo del monorepo que lo
implementará, al tipo de verificación que lo comprobará y a su estado actual.
Las rutas corresponden al plan de arquitectura (`docs/architecture/overview.md`,
`docs/architecture/decisions.md`); la mayoría todavía no existe en el repositorio y se creará
cuando inicie su fase. El estado "pendiente" significa que no hay rama abierta;
"en curso" nombra la rama donde se trabaja y "parcial" identifica requisitos
cuya base existe pero todavía depende de otro módulo. Esta matriz se actualiza
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
| RF-10 | Supervisor Central solo agregados | `packages/auth`, `apps/api/src/modules/identity`, `apps/api/src/modules/reports` | integración Vitest + MySQL | parcial: permisos listos; reportes pendientes |
| RF-11 | Admin Central: usuarios, roles y auditoría | `packages/auth`, `apps/api/src/modules/identity`, `apps/api/src/modules/administration` | integración Vitest + MySQL | parcial: usuarios y roles listos; auditoría pendiente |
| RF-12 | Pase de lista en menos de 3 clics | `apps/web/src/features/attendance` | e2e Playwright | en curso (rama feat/attendance-records: pase de lista en dos clics) |
| RF-13 | Escaneo QR/código de barras | `apps/web/src/features/attendance`, `apps/api/src/modules/attendance` | e2e Playwright, integración Vitest + MySQL | pendiente |
| RF-14 | Estados de asistencia | `packages/domain` (estados y reglas), `apps/api/src/modules/attendance` | unitaria Vitest | en curso (rama feat/attendance-records: registro por lote con auditoría) |
| RF-15 | Jornada por estancia, fecha y turno | `packages/domain`, `apps/api/src/modules/attendance`, `packages/db` (índice único) | unitaria Vitest, integración Vitest + MySQL | en curso (rama feat/phase-2-attendance-foundation) |
| RF-16 | Tablero semaforizado en tiempo real | `apps/api/src/modules/reports`, `apps/web/src/features/reports` | integración Vitest + MySQL, e2e Playwright | pendiente |
| RF-17 | Exportación Excel y PDF por periodo | `apps/api/src/modules/reports` | integración Vitest + MySQL | pendiente |
| RF-18 | Reportes anonimizados para roles centrales | `apps/api/src/modules/reports`, `packages/auth` | integración Vitest + MySQL | pendiente |
| RF-19 | Expediente PDF para traslados | `apps/api/src/modules/reports`, `apps/api/src/modules/children` | integración Vitest + MySQL | pendiente |
| RF-20 | Cola IndexedDB con Service Worker | `apps/web/src/offline` (Dexie/IndexedDB, Service Worker) | unitaria Vitest, e2e Playwright | pendiente |
| RF-21 | Sincronización automática al reconectar | `apps/web/src/offline`, endpoint de sync en `apps/api` | e2e Playwright | pendiente |
| RF-22 | Eventos idempotentes | endpoint de sync en `apps/api`, `packages/db` (`uuid_cliente`, `uuid_operacion`) | integración Vitest + MySQL | pendiente |
| RF-23 | Sin pérdida de datos offline | `apps/web/src/offline`, endpoint de sync en `apps/api` | e2e Playwright | pendiente |
| RF-24 | Ticket automático por ausencia al cierre 09:00 | `apps/api/src/modules/follow-ups`, `packages/domain` | unitaria Vitest, integración Vitest + MySQL | pendiente |
| RF-25 | Contacto telefónico obligatorio | `apps/api/src/modules/follow-ups`, `apps/web/src/features/follow-ups` | integración Vitest + MySQL | pendiente |
| RF-26 | Clasificación de causa | `packages/domain`, `apps/api/src/modules/follow-ups` | unitaria Vitest | pendiente |
| RF-27 | NO_LOC: segundo intento y alerta | `apps/api/src/modules/follow-ups` | integración Vitest + MySQL | pendiente |
| RF-28 | Fecha estimada de retorno | `apps/api/src/modules/follow-ups`, `apps/web/src/features/follow-ups` | integración Vitest + MySQL | pendiente |
| RF-29 | Candado médico | `packages/domain`, `apps/api/src/modules/follow-ups`, `apps/api/src/modules/attendance` | unitaria Vitest, integración Vitest + MySQL | pendiente |
| RF-30 | Alta médica por Médico | `apps/api/src/modules/follow-ups`, `packages/auth` | integración Vitest + MySQL | pendiente |
| RF-31 | Catálogo de estancias | `apps/api/src/modules/administration`, `apps/web/src/features/administration` | integración Vitest + MySQL | pendiente |
| RF-32 | Catálogo de salas/grupos | `apps/api/src/modules/administration`, `apps/web/src/features/administration` | integración Vitest + MySQL | en curso (rama initialFeaturesContinuation: solo listado de salas; falta el CRUD) |
| RF-33 | Catálogo de infantes | `apps/api/src/modules/children`, `apps/web/src/features/children` | integración Vitest + MySQL | en curso (rama initialFeaturesContinuation: alta y listado; faltan edición y baja) |
| RF-34 | Catálogo de tutores y relación con infantes | `apps/api/src/modules/children`, `apps/web/src/features/children` | integración Vitest + MySQL | en curso (rama initialFeaturesContinuation: alta, vínculo y teléfono cifrado; falta editar y quitar) |
| RF-35 | Inscripciones y movimientos | `apps/api/src/modules/children`, `packages/domain` | integración Vitest + MySQL | en curso (rama initialFeaturesContinuation: alta inicial y movimiento ALTA; faltan cambio de sala, traslado y baja) |
| RF-36 | Consentimiento del tutor | `apps/api/src/modules/children`, `apps/web/src/features/children` | integración Vitest + MySQL | en curso (rama initialFeaturesContinuation: registro y revocación) |

## Requisitos no funcionales

| ID | Requisito | Paquete o módulo | Verificación | Estado |
| --- | --- | --- | --- | --- |
| RNF-01 | AES-256 en reposo | `apps/api/src/common` (encryption service), `packages/db` (columnas `*_cifrado`) | unitaria Vitest, integración Vitest + MySQL | en curso (rama initialFeaturesContinuation: teléfono, discapacidad y bitácora cifrados; faltan las notas de seguimiento) |
| RNF-02 | Auditoría inmutable con diff | `apps/api/src/common` (audit interceptor), `packages/db` (tabla `auditoria`, solo INSERT) | integración Vitest + MySQL, revisión de código | en curso (rama initialFeaturesContinuation: triggers de la migración 0002; auditoría activa en usuarios, infantes, tutores y consentimientos) |
| RNF-03 | Auditoría de lecturas confidenciales | `apps/api/src/common` (audit interceptor), `apps/api/src/modules/follow-ups` | integración Vitest + MySQL | en curso (rama initialFeaturesContinuation: lecturas de padrón, tutores, teléfono y consentimientos; faltan las notas de seguimiento) |
| RNF-04 | Borrado lógico, nunca DELETE | `packages/db` (Drizzle, MySQL 8), repositorios de `apps/api` | integración Vitest + MySQL, revisión de código | en curso (rama initialFeaturesContinuation: `deleted_at` y `deleted_by`; falta aplicarlo en edición y baja) |
| RNF-05 | Retención: ciclo activo, 5 años archivado | `packages/db`, `apps/api/src/modules/administration` | integración Vitest + MySQL, revisión de código | en curso (rama initialFeaturesContinuation: tabla `ciclos_escolares`) |
| RNF-06 | Autorización en backend | `apps/api/src/modules/identity` (guards), `packages/auth` | integración Vitest + MySQL, revisión de código | pendiente |
| RNF-07 | Sin datos reales de menores en el repositorio | repositorio completo, `packages/db` (seeds sintéticos) | revisión de código | en curso (rama initialFeaturesContinuation: semillas sintéticas, sin infantes ni tutores reales) |
| RNF-08 | p95 < 1.5 s con 212 estancias | `apps/api/src/modules/attendance`, `apps/api/src/modules/follow-ups`, `packages/db` (índices) | medición de carga | pendiente |
| RNF-09 | Cobertura 80 % en lógica de negocio | `packages/domain`, `packages/auth`, `apps/api/src/modules/*` | unitaria Vitest, integración Vitest + MySQL (reporte de cobertura) | pendiente |
| RNF-10 | Complejidad ciclomática < 10 | `packages/eslint-config` (regla `complexity: 10`) | inspección de ESLint | implementado en `main` |
| RNF-11 | Sin `console` ni código muerto | `packages/eslint-config` (`no-console`, `no-unused-vars`) | inspección de ESLint | implementado en `main` |
| RNF-12 | Compuertas de calidad en CI | `.github/workflows`, `tooling/` | revisión de código | implementado en `main` |
| RNF-13 | F1: SRS y RTM | `docs/requirements` | revisión de código | implementado en `main` |
| RNF-14 | F2: ER y prototipos de UI | `docs/architecture/data-model.md`, `apps/web/src/features/*` | revisión de código | pendiente |
| RNF-15 | F3: repositorio con 80 % de cobertura | repositorio completo | unitaria Vitest, integración Vitest + MySQL, e2e Playwright | pendiente |
| RNF-16 | F4: script de migración y manual | `packages/db` (migraciones Drizzle), `docs/` (manual de instalación) | integración Vitest + MySQL, revisión de código | pendiente |
| RNF-17 | F5: UAT con 3 a 5 estancias piloto | `apps/web`, `apps/api` | e2e Playwright | pendiente |

## Resumen

| Métrica | Valor |
| --- | --- |
| Requisitos funcionales (RF) | 36 |
| Requisitos no funcionales (RNF) | 17 |
| Total | 53 |
| Mapeados a paquete o módulo | 53 (100 %) |
| Implementados | 13 (RF-01 a RF-09, RNF-10 a RNF-13) |
| Parciales | 2 (RF-10, RF-11) |
| En curso | 14 (RF-12, RF-14, RF-15, RF-32 a RF-36, RNF-01 a RNF-05, RNF-07) |
| Pendientes | 24 |
