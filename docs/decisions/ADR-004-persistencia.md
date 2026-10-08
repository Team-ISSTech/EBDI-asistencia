# ADR-004: Persistencia y acceso a datos

- Estado: aceptada
- Fecha: 2026-10-07
- Depende de: ADR-003

## Contexto

`packages/db` está reservado pero vacío. El SRS exige: cifrado AES-256 en reposo
para diagnósticos, teléfonos y notas familiares; bitácora de auditoría inmutable
con diff de payload; borrado lógico, nunca físico, en registros sensibles;
retención de 5 años; índice compuesto para consultas de asistencia por
estancia, infante, fecha y turno; p95 < 1.5 s con 212 estancias concurrentes.
El SRS nombra MySQL/MariaDB como motor. La F4 pide un script de migración.

## Opciones

### Opción A: PostgreSQL 16 + Drizzle ORM

- `jsonb` indexable para el diff de auditoría y para payloads de eventos
  idempotentes de sincronización offline.
- Índices parciales (`WHERE deleted_at IS NULL`) hacen barato el borrado lógico.
- Row Level Security permite reforzar en el motor el aislamiento por estancia,
  como segunda barrera detrás de la autorización en NestJS.
- DDL transaccional: una migración fallida se revierte completa.
- Desviación adicional respecto al SRS (ya desviado por ADR-003).

### Opción B: MySQL 8 / MariaDB + Drizzle ORM

- Mismo motor que nombra el SRS; menor fricción con el evaluador y con el
  diagrama ER que el equipo ya elaboró, escrito para MySQL.
- `JSON` existe pero su indexación es más limitada; no hay índices parciales
  ni RLS; el DDL no es transaccional.
- Drizzle soporta MySQL con la misma API; cambiar de motor después es un
  cambio de `packages/db`, no de la API ni del dominio.

### Opción C (descartada): Prisma, TypeORM o MikroORM

Prisma introduce un motor de consultas binario y un DSL propio; TypeORM arrastra
decoradores sobre entidades y hace difícil mantener `packages/domain` libre de
ORM. Drizzle genera SQL explícito, es solo TypeScript y produce migraciones SQL
planas que sirven directamente como entregable de F4.

## Decisión

Opción B (MySQL 8 + Drizzle). El esquema que el equipo ya elaboró
(`docs/architecture/data-model.md`) está escrito para MySQL (InnoDB, utf8mb4,
`DATETIME(6)`, `ON DUPLICATE KEY UPDATE`) y el SRS nombra el mismo motor, de
modo que el script de migración de F4 se entrega sin traducción. Las ventajas
de PostgreSQL (índices parciales, RLS, `jsonb`) no justifican una segunda
desviación frente al SRS ni rehacer el ER del equipo; el aislamiento por
estancia y el borrado lógico se garantizan en la capa de repositorios de la
API con pruebas de integración. Si en F3 las consultas de reportes sobre 212
estancias no alcanzan p95 < 1.5 s, se revisará esta decisión con datos.

## Reglas que aplican en cualquiera de las dos opciones

- `packages/db` es el único lugar con esquema Drizzle, migraciones y cliente.
- `apps/api` accede a datos mediante repositorios de cada módulo, nunca desde
  controladores.
- `packages/domain` no importa Drizzle ni el driver.
- Toda tabla sensible lleva `deleted_at` (y `deleted_by` si el equipo
  acepta la pregunta P2 del modelo de datos); ninguna operación de la API
  ejecuta `DELETE` sobre ellas.
- Tabla `auditoria` solo con `INSERT` desde la API; sin `UPDATE` ni `DELETE`.
- Columnas cifradas se almacenan como `VARBINARY`/`LONGBLOB` con prefijo de
  versión de llave para permitir rotación.
- Unicidad de asistencia por infante, jornada y turno mediante
  `uq_jornada_estancia_fecha_turno` + `uq_asistencia_jornada_inscripcion`,
  equivalente normalizado del índice que pide el SRS (ver P1).

## Decisiones sobre el esquema del equipo (2026-10-07)

Resolución de las preguntas P1..P11 de `docs/architecture/data-model.md`.

| Pregunta | Decisión |
| --- | --- |
| P1 | Diseño normalizado: `jornadas_asistencia` + `asistencias`; la unicidad por infante, jornada y turno la dan los índices existentes. Sin desnormalizar `infante_id`. |
| P2 | Se añade `deleted_by` (FK a `usuarios`, nulo) junto a cada `deleted_at`. |
| P3 | Inmutabilidad de `auditoria` por triggers (migración 0002) y, además, un usuario de base de datos de ejecución con solo `INSERT` y `SELECT` sobre `auditoria`, distinto del usuario de migraciones. Se documenta en el manual de instalación (F4). |
| P4 | Los diagnósticos viven en las columnas cifradas existentes: `incidencias_asistencia.descripcion_cifrada` y `altas_medicas.observaciones_cifradas`. Sin entidad de expediente médico en Fase 1. |
| P5 | `infantes.grupo_discapacidad` pasa a columna cifrada; los reportes agrupan solo por `tiene_discapacidad`. |
| P6 | Todo contacto de emergencia es un tutor (`infante_tutor.es_contacto_emergencia`); sin tabla aparte. |
| P7 | Resuelta: tabla `sesiones` (migración 0001). |
| P8 | Se añade `ciclos_escolares` con estado `ACTIVO`/`ARCHIVADO`, enlazada desde `jornadas_asistencia` e `inscripciones`; la retención de 5 años se aplica por ciclo. |
| P9 | Un solo rol de supervisión (`SUPERVISOR_CENTRAL`) con alcance por región: `usuario_rol` gana `region` (nulo = todo el sistema). |
| P10 | Los permisos de catálogos, exportación, consentimiento y expediente se añaden al iniciar cada módulo, con su prueba en la matriz. |
| P11 | Los estados siguen en `VARCHAR`; los valores válidos se fijan en `packages/domain` y se refuerzan con restricciones `CHECK` en la migración de cada módulo (MySQL ≥ 8.0.16 las aplica). |

Las migraciones que implementan P2, P5, P8 y P9 se abren en la rama de catálogos; ninguna modifica el SQL original del equipo (`0000`), solo añaden archivos.

## Consecuencias

- Se añaden `drizzle-orm`, `drizzle-kit` y el driver `mysql2` a `packages/db`.
- Desarrollo local con MySQL 8 en Docker Compose; en pruebas de integración se
  usa el mismo motor, no SQLite, para no ocultar diferencias de dialecto.
- La F4 entrega el SQL generado por `drizzle-kit` más un manual de instalación.
