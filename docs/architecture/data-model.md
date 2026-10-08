# Modelo de datos

Esquema propuesto por el equipo (`sirai_schema_propuesta.sql`, MySQL 8 /
InnoDB, octubre 2026) transcrito a Mermaid. El SQL original se incorporará a
`packages/db` como primera migración cuando se abra la rama de persistencia
(ADR-004). Aquí se muestran las columnas relevantes para entender relaciones,
cifrado, borrado lógico y auditoría; el SQL es la fuente completa.

Convenciones del esquema: `BIGINT UNSIGNED` como llave primaria, `created_at` /
`updated_at` en `DATETIME(6)` UTC, `deleted_at` para borrado lógico, columnas
`*_cifrado(a)` en `VARBINARY` / `LONGBLOB` para AES-256, `*_hash` en
`BINARY(32)` (SHA-256) para búsquedas sin descifrar, `*_sha256` para integridad
de evidencias en almacenamiento externo.

## Diagrama entidad-relación

```mermaid
erDiagram
    estancias {
        bigint id PK
        varchar clave_ebdi UK
        varchar ur
        varchar nombre
        varchar region
        varchar zona_horaria
        varchar estatus
        datetime deleted_at
    }
    salas_grupos {
        bigint id PK
        bigint estancia_id FK
        varchar nombre
        varchar turno
        smallint capacidad
        varchar estatus
        datetime deleted_at
    }
    infantes {
        bigint id PK
        varchar matricula UK
        char curp UK
        varchar nombre
        varchar apellido_paterno
        varchar apellido_materno
        date fecha_nacimiento
        tinyint tiene_discapacidad
        varchar grupo_discapacidad
        varchar estatus
        datetime deleted_at
    }
    tutores {
        bigint id PK
        varchar nombre
        varchar apellido_paterno
        varbinary telefono_cifrado
        binary telefono_hash
        varchar correo
        varchar estatus
        datetime deleted_at
    }
    infante_tutor {
        bigint infante_id PK_FK
        bigint tutor_id PK_FK
        varchar parentesco
        tinyint es_tutor_principal
        tinyint autorizado_recoger
        tinyint es_contacto_emergencia
        date vigencia_desde
        date vigencia_hasta
    }
    usuarios {
        bigint id PK
        bigint estancia_default_id FK
        varchar nombre
        varchar correo UK
        varchar password_hash
        varchar estatus
        smallint intentos_fallidos
        datetime bloqueado_hasta
        datetime ultimo_acceso_at
        datetime deleted_at
    }
    roles {
        smallint id PK
        varchar codigo UK
        varchar nombre
    }
    permisos {
        smallint id PK
        varchar codigo UK
        varchar descripcion
    }
    usuario_rol {
        bigint id PK
        bigint usuario_id FK
        smallint rol_id FK
        bigint estancia_id FK
        datetime vigente_desde
        datetime vigente_hasta
    }
    rol_permiso {
        smallint rol_id PK_FK
        smallint permiso_id PK_FK
    }
    inscripciones {
        bigint id PK
        bigint infante_id FK
        bigint estancia_id FK
        bigint sala_grupo_id FK
        varchar estrato
        date fecha_inicio
        date fecha_fin
        varchar estatus
        datetime deleted_at
    }
    movimientos_inscripcion {
        bigint id PK
        bigint inscripcion_id FK
        varchar tipo_movimiento
        datetime fecha_movimiento
        bigint estancia_anterior_id FK
        bigint estancia_nueva_id FK
        bigint usuario_id FK
    }
    jornadas_asistencia {
        bigint id PK
        bigint estancia_id FK
        date fecha
        varchar turno
        varchar estado
        datetime abierta_at
        datetime cerrada_at
        bigint abierta_por FK
        bigint cerrada_por FK
    }
    asistencias {
        bigint id PK
        bigint jornada_id FK
        bigint inscripcion_id FK
        varchar estado
        datetime hora_entrada
        datetime hora_salida
        varchar metodo_registro
        char uuid_cliente UK
        bigint registrado_por FK
        datetime anulada_at
        bigint anulada_por FK
    }
    incidencias_asistencia {
        bigint id PK
        bigint asistencia_id FK
        varchar tipo
        longblob descripcion_cifrada
        varchar evidencia_storage_key
        bigint registrada_por FK
        datetime deleted_at
    }
    seguimientos {
        bigint id PK
        bigint asistencia_id FK_UK
        varchar clasificacion
        varchar estado
        date fecha_probable_retorno
        tinyint requiere_alta_medica
        bigint responsable_usuario_id FK
        datetime abierto_at
        datetime cerrado_at
        datetime deleted_at
    }
    contactos_seguimiento {
        bigint id PK
        bigint seguimiento_id FK
        bigint tutor_id FK
        smallint numero_intento
        datetime fecha_hora
        varchar canal
        varchar resultado
        varbinary telefono_destino_cifrado
        longblob notas_asesoria_cifradas
        datetime proximo_intento_at
        bigint registrado_por FK
        datetime deleted_at
    }
    altas_medicas {
        bigint id PK
        bigint seguimiento_id FK_UK
        date fecha_alta
        bigint medico_usuario_id FK
        longblob observaciones_cifradas
        varchar documento_storage_key
    }
    consentimientos {
        bigint id PK
        bigint infante_id FK
        bigint tutor_id FK
        varchar tipo
        varchar version_aviso
        tinyint aceptado
        datetime aceptado_at
        datetime revocado_at
        varchar evidencia_storage_key
        bigint registrado_por FK
    }
    dispositivos {
        bigint id PK
        bigint estancia_id FK
        char identificador_publico UK
        varchar nombre
        binary token_hash UK
        varchar estatus
        datetime revoked_at
    }
    sincronizaciones {
        bigint id PK
        bigint dispositivo_id FK
        char uuid_operacion UK
        varchar entidad
        varchar operacion
        datetime fecha_captura_local
        datetime fecha_recepcion_servidor
        varchar estado
        binary payload_sha256
        smallint reintentos
    }
    auditoria {
        bigint id PK
        bigint usuario_id FK
        varchar rol_codigo
        varchar accion
        varchar tabla_afectada
        varchar registro_id
        longblob datos_anteriores_cifrados
        longblob datos_nuevos_cifrados
        varbinary ip_origen
        varchar user_agent
        char request_id
        datetime ocurrido_at
    }

    estancias ||--o{ salas_grupos : "tiene"
    estancias ||--o{ usuarios : "estancia_default"
    estancias ||--o{ usuario_rol : "alcance"
    estancias ||--o{ inscripciones : "inscribe"
    estancias ||--o{ jornadas_asistencia : "abre"
    estancias ||--o{ dispositivos : "registra"
    infantes ||--o{ infante_tutor : ""
    tutores ||--o{ infante_tutor : ""
    infantes ||--o{ inscripciones : ""
    salas_grupos ||--o{ inscripciones : ""
    inscripciones ||--o{ movimientos_inscripcion : ""
    inscripciones ||--o{ asistencias : ""
    jornadas_asistencia ||--o{ asistencias : ""
    asistencias ||--o{ incidencias_asistencia : ""
    asistencias ||--o| seguimientos : "ausencia abre"
    seguimientos ||--o{ contactos_seguimiento : ""
    seguimientos ||--o| altas_medicas : ""
    tutores ||--o{ contactos_seguimiento : ""
    infantes ||--o{ consentimientos : ""
    tutores ||--o{ consentimientos : ""
    usuarios ||--o{ usuario_rol : ""
    roles ||--o{ usuario_rol : ""
    roles ||--o{ rol_permiso : ""
    permisos ||--o{ rol_permiso : ""
    dispositivos ||--o{ sincronizaciones : ""
    usuarios ||--o{ auditoria : ""
```

## Catálogos iniciales de seguridad

Roles: `DIRECTORA`, `DOCENTE`, `TRABAJO_SOCIAL`, `ENFERMERIA`, `MEDICO`,
`SUPERVISOR_CENTRAL`, `ADMIN_CENTRAL`.

Permisos: `ASISTENCIA_CONSULTAR`, `ASISTENCIA_REGISTRAR`, `JORNADA_CERRAR`,
`SEGUIMIENTO_CONSULTAR`, `SEGUIMIENTO_REGISTRAR`, `NOTA_SENSIBLE_CONSULTAR`,
`ALTA_MEDICA_REGISTRAR`, `REPORTE_AGREGADO_CONSULTAR`, `USUARIO_ADMINISTRAR`,
`AUDITORIA_CONSULTAR`.

Vistas: `vw_asistencia_diaria` y `vw_seguimientos_abiertos`.

## Revisión contra el SRS

| Requisito | Cobertura en el esquema | Evaluación |
| --- | --- | --- |
| Índice `(estancia_id, infante_id, fecha, turno)` | `uq_jornada_estancia_fecha_turno (estancia_id, fecha, turno)` + `uq_asistencia_jornada_inscripcion (jornada_id, inscripcion_id)`; el infante se alcanza vía `inscripciones` | Equivalente normalizado. Garantiza un registro por infante, jornada y turno. Ver pregunta P1. |
| Borrado lógico | `deleted_at` en estancias, salas, infantes, tutores, usuarios, inscripciones, incidencias, seguimientos, contactos; `anulada_at` en asistencias; `revoked_at` en dispositivos | Cubierto en entidades sensibles. Falta `deleted_by` en todas. Ver P2. |
| Auditoría inmutable con usuario, rol, IP, user agent, timestamp y diff | `auditoria` con todos los campos; diff como `datos_anteriores_cifrados` / `datos_nuevos_cifrados` | Cubierto. Inmutabilidad por triggers (migración 0002) más usuario de ejecución con solo `INSERT`/`SELECT` (decisión P3). |
| Cifrado AES-256 de diagnósticos, teléfonos y notas familiares | `telefono_cifrado`, `telefono_destino_cifrado`, `descripcion_cifrada`, `notas_asesoria_cifradas`, `observaciones_cifradas` | Cubierto para teléfonos y notas. No hay columna de diagnóstico; `grupo_discapacidad` está en claro. Ver P4 y P5. |
| Registro de consentimiento del tutor | `consentimientos` con tipo, versión del aviso, evidencia y revocación | Cubierto. |
| Contactos de emergencia del tutor | `infante_tutor.es_contacto_emergencia` | Cubierto mientras todo contacto de emergencia sea un tutor registrado. Ver P6. |
| Ticket de seguimiento por ausencia | `seguimientos` (1:1 con `asistencias`), `contactos_seguimiento`, `altas_medicas`, `requiere_alta_medica` | Cubierto. Clasificación `ENF_CASA` / `ACC_EXT` / `PER_TUT` / `NO_LOC` cabe en `clasificacion`. |
| Sesiones con alcance por estancia | `usuario_rol.estancia_id` da el alcance del rol; la tabla `sesiones` se añade en la migración 0001 (`packages/db/sql`) | Cubierto tras resolver P7. |
| Retención: activo en ciclo, archivado 5 años | No hay ciclo escolar ni marca de archivado | No cubierto. Ver P8. |
| Eventos idempotentes offline | `asistencias.uuid_cliente` único, `sincronizaciones.uuid_operacion` único | Cubierto. |

## Preguntas para el equipo

Resueltas el 2026-10-07; la decisión de cada una queda registrada en ADR-004
y se implementa en las migraciones del módulo correspondiente.

- **P1.** Para consultar la asistencia histórica de un infante a lo largo de
  varias inscripciones (reporte trimestral, expediente PDF) la ruta es
  `infantes → inscripciones → asistencias → jornadas`. ¿Aceptan ese costo o
  prefieren desnormalizar `infante_id` y `estancia_id` en `asistencias` con el
  índice compuesto literal del SRS?
  **Decisión: A, normalizado.** Se conserva la ruta por `inscripciones`; no se desnormaliza.
- **P2.** ¿Agregamos `deleted_by` (FK a `usuarios`) junto a cada `deleted_at`
  para que el borrado lógico sea atribuible sin consultar `auditoria`?
  **Decisión: sí.** Se añade `deleted_by` en cada tabla con `deleted_at`.
- **P3.** La inmutabilidad de `auditoria` se garantiza solo si el usuario de
  BD de la API no tiene `UPDATE`/`DELETE` sobre esa tabla. ¿Quién administra
  los grants? ¿Lo documentamos en el manual de instalación de F4?
  **Decisión: triggers (migración 0002) + usuario de ejecución con solo INSERT/SELECT en `auditoria`**, documentado en el manual de F4.
- **P4.** El SRS exige cifrar diagnósticos. No existe columna de diagnóstico.
  ¿Vive en `incidencias_asistencia.descripcion_cifrada`, en
  `altas_medicas.observaciones_cifradas`, o falta una entidad de expediente
  médico para Fase 2?
  **Decisión: columnas cifradas existentes** (`incidencias_asistencia`, `altas_medicas`); expediente médico fuera de Fase 1.
- **P5.** `infantes.grupo_discapacidad` es dato de salud en texto claro.
  ¿Lo movemos a una columna cifrada?
  **Decisión: cifrar** `grupo_discapacidad`; los reportes agrupan por `tiene_discapacidad`.
- **P6.** `NO_LOC` exige alertar a contactos de emergencia. Si un contacto de
  emergencia no es tutor (vecino, familiar sin custodia), no cabe en
  `infante_tutor`. ¿Se acepta la restricción "todo contacto es un tutor" o se
  necesita una tabla `contactos_emergencia`?
  **Decisión: todo contacto es un tutor** con `es_contacto_emergencia`.
- **P7 (resuelta el 2026-10-07).** Sesiones en servidor: tabla `sesiones`
  (`usuario_id`, `estancia_activa_id`, `token_hash`, `expira_at`,
  `revocada_at`, IP y user agent), migración 0001. Permite revocar, auditar
  y cambiar de estancia sin reemitir credenciales. Se descartó JWT sin
  estado.
- **P8.** Retención de 5 años: ¿se modela un `ciclos_escolares` con estado
  `ACTIVO`/`ARCHIVADO` y se vincula a `jornadas_asistencia` e
  `inscripciones`, o se archiva por rango de `fecha`?
  **Decisión: `ciclos_escolares`** con `ACTIVO`/`ARCHIVADO`, enlazado desde jornadas e inscripciones.
- **P9.** El SRS nombra "Supervisor Regional"; el catálogo tiene
  `SUPERVISOR_CENTRAL` y `estancias.region`. ¿Es el mismo rol con alcance por
  región (y entonces `usuario_rol` necesita `region`) o son dos roles?
  **Decisión: un rol** `SUPERVISOR_CENTRAL` con alcance por región (`usuario_rol.region`).
- **P10.** Faltan permisos para catálogos (estancias, salas, infantes,
  tutores), exportación de reportes, registro de consentimientos y exportación
  del expediente PDF. ¿Se añaden a `permisos` ahora o cuando inicie cada
  módulo?
  **Decisión: al iniciar cada módulo**, con prueba en la matriz.
- **P11.** Los `estatus`, `estado`, `turno` y `clasificacion` son `VARCHAR`.
  Se propone fijar sus valores válidos en `packages/domain` y validar en la
  API, sin `ENUM` en MySQL para no requerir migración por cada valor nuevo.
  ¿De acuerdo?
  **Decisión: `VARCHAR` + `CHECK`**; valores en `packages/domain`, restricciones en la migración de cada módulo.
