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
| RF-11 | Admin Central: usuarios, roles y auditoría | `packages/auth`, `apps/api/src/modules/identity`, `apps/api/src/modules/administration` | integración Vitest + MySQL | implementado (usuarios, roles y consulta de la bitácora con filtros y paginación; del cambio solo los nombres de los campos, supuesto S-23) |
| RF-12 | Pase de lista en menos de 3 clics | `apps/web/src/features/attendance` | e2e Playwright | implementado en `main` (pase de lista en dos clics, comprobado con e2e Playwright en `apps/web/e2e/roll-call.spec.ts`) |
| RF-13 | Escaneo QR/código de barras | `apps/web/src/features/attendance` | unitaria Vitest (pantalla con lector simulado y cámara simulada), e2e Playwright (lector y captura manual) | parcial: el cliente pide un lector para credenciales de infantes y tutores autorizados; está implementado el ingreso de infantes por matrícula (lector, cámara o captura manual). Faltan las credenciales de tutores y la salida, que el documento no define (S-22) |
| RF-14 | Estados de asistencia | `packages/domain` (estados y reglas), `apps/api/src/modules/attendance` | unitaria Vitest | implementado en `main` |
| RF-15 | Jornada por estancia, fecha y turno | `packages/domain`, `apps/api/src/modules/attendance`, `packages/db` (índice único) | unitaria Vitest, integración Vitest + MySQL | implementado en `main` |
| RF-16 | Tablero semaforizado en tiempo real | `apps/api/src/modules/reports`, `apps/web/src/features/reports` | integración Vitest + MySQL, e2e Playwright | implementado en `main` (umbrales del semáforo por confirmar, S-15) |
| RF-17 | Exportación Excel y PDF por periodo | `apps/api/src/modules/reports` | integración Vitest + MySQL | implementado en `main` (cortes por confirmar, S-16) |
| RF-18 | Reportes anonimizados para roles centrales | `apps/api/src/modules/reports`, `packages/auth` | integración Vitest + MySQL | implementado en `main` |
| RF-19 | Expediente PDF para traslados | `apps/api/src/modules/reports`, `apps/api/src/modules/children` | integración Vitest + MySQL | implementado en `main` (sello de integridad, no e.firma: S-17) |
| RF-20 | Cola IndexedDB con Service Worker | `apps/web/src/offline` (Dexie/IndexedDB cifrado, Service Worker con `vite-plugin-pwa`) | unitaria Vitest, e2e Playwright (`offline-capture.spec.ts`, a mano) | implementado (cola cifrada en la tablet, Service Worker que abre la aplicación sin red, sesión y lista del día guardadas; supuesto S-25) |
| RF-21 | Sincronización automática al reconectar | `apps/web/src/offline`, endpoint de sync en `apps/api` | unitaria Vitest, integración Vitest + MySQL, e2e Playwright | implementado (envío al reconectar, al volver a la pantalla y cada 30 s, por lotes y con espera creciente ante fallas) |
| RF-22 | Eventos idempotentes | `apps/web/src/offline`, endpoint de sync en `apps/api`, `packages/db` (`uuid_cliente`, `uuid_operacion`) | unitaria Vitest, integración Vitest + MySQL | implementado (cada captura lleva su UUID desde que se guarda en la tablet; reenviarla nunca duplica) |
| RF-23 | Sin pérdida de datos offline | `apps/web/src/offline`, endpoint de sync en `apps/api` | unitaria Vitest, e2e Playwright | implementado (nada se descarta hasta que el servidor confirma; lo rechazado queda para revisar; cerrar sesión avisa de lo pendiente; ver `docs/operations/protocolo-caida-de-enlace.md`) |
| RF-24 | Ticket automático por ausencia al cierre 09:00 | `apps/api/src/modules/follow-ups`, `packages/domain` | unitaria Vitest, integración Vitest + MySQL | implementado en `main` (solo jornadas matutinas; el SRS no define el vespertino) |
| RF-25 | Contacto telefónico obligatorio | `apps/api/src/modules/follow-ups`, `apps/web/src/features/follow-ups` | integración Vitest + MySQL | implementado en `main` |
| RF-26 | Clasificación de causa | `packages/domain`, `apps/api/src/modules/follow-ups` | unitaria Vitest | implementado en `main` |
| RF-27 | NO_LOC: segundo intento y alerta | `apps/api/src/modules/follow-ups`, `apps/api/src/modules/emergency-notices`, `packages/db` (`avisos_emergencia`) | unitaria Vitest, integración Vitest + MySQL (canal simulado) | parcial: segundo intento a las 4 h, alerta en pantalla y aviso por WhatsApp a los contactos de emergencia, todo probado con un canal simulado; falta probar con la cuenta de WhatsApp Business del cliente y la plantilla aprobada (S-26, `docs/operations/avisos-whatsapp.md`) |
| RF-28 | Fecha estimada de retorno | `apps/api/src/modules/follow-ups`, `apps/web/src/features/follow-ups` | integración Vitest + MySQL | implementado en `main` |
| RF-29 | Candado médico | `packages/domain`, `apps/api/src/modules/follow-ups`, `apps/api/src/modules/attendance` | unitaria Vitest, integración Vitest + MySQL | implementado en `main` |
| RF-30 | Alta médica por Médico | `apps/api/src/modules/follow-ups`, `packages/auth` | integración Vitest + MySQL | implementado en `main` |
| RF-31 | Catálogo de estancias | `apps/api/src/modules/administration`, `apps/web/src/features/administration` | integración Vitest + MySQL | implementado (alta, edición y baja lógica auditadas; la baja se bloquea con inscritos o jornadas abiertas) |
| RF-32 | Catálogo de salas/grupos | `apps/api/src/modules/administration`, `apps/web/src/features/administration` | integración Vitest + MySQL | implementado (alta, edición, desactivación y baja lógica; capacidad, turno y sala llena en la inscripción) |
| RF-33 | Catálogo de infantes | `apps/api/src/modules/children`, `apps/web/src/features/children` | integración Vitest + MySQL | implementado (alta, edición y eliminación lógica; la baja de la inscripción es el movimiento de RF-35) |
| RF-34 | Catálogo de tutores y relación con infantes | `apps/api/src/modules/children`, `apps/web/src/features/children` | integración Vitest + MySQL | implementado (alta, edición con teléfono recifrado, permisos del vínculo y desvinculación con historial) |
| RF-35 | Inscripciones y movimientos | `apps/api/src/modules/children`, `packages/domain` | integración Vitest + MySQL | implementado (alta, cambio de sala, baja y traslado con recepción en la estancia de destino; supuesto S-21) |
| RF-36 | Consentimiento del tutor | `apps/api/src/modules/children`, `apps/web/src/features/children` | integración Vitest + MySQL | implementado en `main` (la versión del aviso la fija el servidor; falta confirmar la versión real) |
| RF-37 | API con Bearer tokens para sistemas institucionales (A21A, #52) | `apps/api/src/modules/integration`, `packages/db` (`sistemas_integracion`, migración 0015), `packages/auth` (alcances) | integración Vitest + MySQL, unitaria Vitest | implementado (credenciales de cliente, JWT de 15 min, alcances, revocación inmediata, límite y auditoría; un solo endpoint de lectura agregada, supuesto S-18) |
| RF-38 | Cambio de contraseña temporal y voluntario | `apps/api/src/modules/identity`, `apps/web/src/features/auth`, `packages/contracts` | integración Vitest + MySQL, unitaria Vitest | implementado (cambio obligatorio con temporal, voluntario, caducidad y restablecimiento por administrador; supuesto S-19) |

## Requisitos no funcionales

| ID | Requisito | Paquete o módulo | Verificación | Estado |
| --- | --- | --- | --- | --- |
| RNF-01 | AES-256 en reposo | `apps/api/src/common` (encryption service), `packages/db` (columnas `*_cifrado`) | unitaria Vitest, integración Vitest + MySQL | implementado en `main` (teléfono, discapacidad, notas, observaciones médicas y bitácora) |
| RNF-02 | Auditoría inmutable con diff | `apps/api/src/common` (audit interceptor), `packages/db` (tabla `auditoria`, solo INSERT) | integración Vitest + MySQL, revisión de código | implementado en `main` (triggers de la migración 0002) |
| RNF-03 | Auditoría de lecturas confidenciales | `apps/api/src/common` (audit interceptor), `apps/api/src/modules/follow-ups` | integración Vitest + MySQL | implementado en `main` (padrón, tutores, teléfono, notas, seguimientos, expedientes y exportaciones) |
| RNF-04 | Borrado lógico, nunca DELETE | `packages/db` (Drizzle, MySQL 8), repositorios de `apps/api` | integración Vitest + MySQL, revisión de código | implementado (estancias, salas, infantes, inscripciones, vínculos, tutores y usuarios se dan de baja con `deleted_at`/`deleted_by`; una prueba comprueba que el código de la API no hace ningún `DELETE` físico) |
| RNF-05 | Retención: ciclo activo, 5 años archivado | `packages/domain` (reglas), `packages/db` (migración 0016), `apps/api/src/modules/school-years`, `apps/web/src/features/administration` | unitaria y integración Vitest + MySQL | implementado (abrir ciclo nuevo archiva el anterior, que queda de solo lectura; a los 5 años el administrador central puede depurar sus datos sensibles cifrados sin borrar filas; supuesto S-24) |
| RNF-06 | Autorización en backend | `apps/api/src/modules/identity` (guards), `packages/auth`, `apps/api/src/common/http` (cabeceras), `apps/web/nginx.conf` (CSP) | integración Vitest + MySQL (aislamiento entre estancias), unitaria Vitest (rutas declaradas, cabeceras), `pnpm audit` en CI, revisión de código | implementado: guard cerrado por defecto, permiso declarado en las 63 rutas, aislamiento entre estancias probado, cabeceras y CSP, dependencias sin avisos; la prueba de penetración externa queda pendiente (`docs/operations/revision-de-seguridad.md`) |
| RNF-07 | Sin datos reales de menores en el repositorio | repositorio completo, `packages/db` (seeds sintéticos) | revisión de código | implementado en `main` (semillas sintéticas; sin infantes ni tutores reales) |
| RNF-08 | p95 < 1.5 s con 212 estancias | `apps/api/load` (semilla y ejecutor), `apps/api/src/modules/attendance`, `apps/api/src/modules/follow-ups`, `packages/db` (índices) | medición de carga (manual, no corre en CI) | parcial: con 212 estancias trabajando a la vez cumple en 2 de 3 corridas en un portátil (p95 de 0.65 a 1.3 s) y queda ajustado en las escrituras; falta repetirla en la infraestructura real (`docs/operations/prueba-de-carga.md`) |
| RNF-09 | Cobertura 80 % en lógica de negocio | `packages/domain`, `packages/auth`, `apps/api/src/modules/*`, `tooling/coverage` | unitaria Vitest, integración Vitest + MySQL, reporte consolidado de cobertura en CI | implementado: reporte consolidado en CI con total de 97.9 % en líneas (95.6 % sentencias, 96.8 % funciones, 83.6 % ramas); ver `docs/operations/cobertura.md` |
| RNF-10 | Complejidad ciclomática < 10 | `packages/eslint-config` (regla `complexity: 10`) | inspección de ESLint | implementado en `main` |
| RNF-11 | Sin `console` ni código muerto | `packages/eslint-config` (`no-console`, `no-unused-vars`) | inspección de ESLint | implementado en `main` |
| RNF-12 | Compuertas de calidad en CI | `.github/workflows`, `tooling/` | revisión de código | implementado en `main` |
| RNF-13 | F1: SRS y RTM | `docs/requirements` | revisión de código | implementado en `main` |
| RNF-14 | F2: ER y prototipos de UI | `docs/architecture/data-model.md`, `apps/web/src/features/*`, `packages/ui` (tokens) | revisión de código, e2e Playwright con axe-core (WCAG 2.1 AA por rol, teclado y foco) | implementado: modelo entidad-relación en `data-model.md`; las pantallas de los 7 roles pasan la revisión de accesibilidad (`docs/operations/revision-de-accesibilidad.md`); quedan para revisión manual los formularios que se abren con un botón y los lectores de pantalla |
| RNF-15 | F3: repositorio con 80 % de cobertura | repositorio completo, `tooling/coverage` | unitaria Vitest, integración Vitest + MySQL, e2e Playwright, reporte consolidado de cobertura en CI | implementado: 97.9 % de cobertura de líneas sobre la lógica de negocio (`docs/operations/cobertura.md`) |
| RNF-16 | F4: script de migración y manual | `packages/db` (migraciones SQL, `create-admin`), `docs/operations/manual-de-instalacion.md`, `docs/operations/manual-de-usuario.md` | integración Vitest + MySQL, revisión de código | implementado: migraciones repetibles con `pnpm --filter @sirai/db migrate`, comando para crear el primer administrador y manuales de instalación y de usuario; los datos de infraestructura (dominio, HTTPS, respaldos) quedan a definir con el cliente |
| RNF-17 | F5: UAT con 3 a 5 estancias piloto | `apps/web`, `apps/api` | e2e Playwright | pendiente |

## Resumen

| Métrica | Valor |
| --- | --- |
| Requisitos funcionales (RF) | 38 |
| Requisitos no funcionales (RNF) | 17 |
| Total | 55 |
| Mapeados a paquete o módulo | 55 (100 %) |
| Implementados | 51 |
| Parciales | 3 |
| Pendientes | 1 |
