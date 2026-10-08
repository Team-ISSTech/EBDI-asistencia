-- Esquema propuesto por el equipo (octubre 2026), sin cambios salvo:
-- 1) se eliminan CREATE DATABASE y USE: la base la fija DATABASE_URL;
-- 2) se eliminó un prefijo accidental en la primera línea del archivo original.
-- Ver docs/architecture/data-model.md para el diagrama y las preguntas abiertas.



SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- 1. ORGANIZACION: ESTANCIAS, SALAS Y GRUPOS
CREATE TABLE IF NOT EXISTS estancias (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    clave_ebdi VARCHAR(20) NOT NULL,
    ur VARCHAR(10) NULL,
    nombre VARCHAR(150) NOT NULL,
    region VARCHAR(100) NULL,
    direccion VARCHAR(255) NULL,
    zona_horaria VARCHAR(50) NOT NULL DEFAULT 'America/Mexico_City',
    estatus VARCHAR(20) NOT NULL DEFAULT 'ACTIVA',
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),
    deleted_at DATETIME(6) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_estancias_clave_ebdi (clave_ebdi),
    KEY idx_estancias_estatus (estatus)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS salas_grupos (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    estancia_id BIGINT UNSIGNED NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    turno VARCHAR(20) NOT NULL,
    edad_minima_meses SMALLINT UNSIGNED NULL,
    edad_maxima_meses SMALLINT UNSIGNED NULL,
    capacidad SMALLINT UNSIGNED NULL,
    estatus VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),
    deleted_at DATETIME(6) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_sala_estancia_nombre_turno (estancia_id, nombre, turno),
    KEY idx_salas_estancia_estatus (estancia_id, estatus),
    CONSTRAINT fk_salas_estancia
        FOREIGN KEY (estancia_id) REFERENCES estancias (id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;
-- 2. PERSONAS: INFANTES Y TUTORES
CREATE TABLE IF NOT EXISTS infantes (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    matricula VARCHAR(20) NOT NULL,
    curp CHAR(18) NULL,
    nombre VARCHAR(100) NOT NULL,
    apellido_paterno VARCHAR(100) NOT NULL,
    apellido_materno VARCHAR(100) NULL,
    fecha_nacimiento DATE NOT NULL,
    genero VARCHAR(20) NULL,
    tiene_discapacidad TINYINT(1) NOT NULL DEFAULT 0,
    grupo_discapacidad VARCHAR(100) NULL,
    estatus VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),
    deleted_at DATETIME(6) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_infantes_matricula (matricula),
    UNIQUE KEY uq_infantes_curp (curp),
    KEY idx_infantes_nombre (apellido_paterno, apellido_materno, nombre),
    KEY idx_infantes_estatus (estatus)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS tutores (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    nombre VARCHAR(100) NOT NULL,
    apellido_paterno VARCHAR(100) NOT NULL,
    apellido_materno VARCHAR(100) NULL,
    identificacion_tipo VARCHAR(30) NULL,
    identificacion_folio VARCHAR(100) NULL,
    telefono_cifrado VARBINARY(512) NULL,
    telefono_hash BINARY(32) NULL,
    correo VARCHAR(190) NULL,
    estatus VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),
    deleted_at DATETIME(6) NULL,
    PRIMARY KEY (id),
    KEY idx_tutores_telefono_hash (telefono_hash),
    KEY idx_tutores_correo (correo),
    KEY idx_tutores_nombre (apellido_paterno, apellido_materno, nombre)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS infante_tutor (
    infante_id BIGINT UNSIGNED NOT NULL,
    tutor_id BIGINT UNSIGNED NOT NULL,
    parentesco VARCHAR(50) NOT NULL,
    es_tutor_principal TINYINT(1) NOT NULL DEFAULT 0,
    autorizado_recoger TINYINT(1) NOT NULL DEFAULT 0,
    es_contacto_emergencia TINYINT(1) NOT NULL DEFAULT 0,
    vigencia_desde DATE NOT NULL,
    vigencia_hasta DATE NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),
    PRIMARY KEY (infante_id, tutor_id),
    KEY idx_infante_tutor_tutor (tutor_id),
    CONSTRAINT fk_infante_tutor_infante
        FOREIGN KEY (infante_id) REFERENCES infantes (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_infante_tutor_tutor
        FOREIGN KEY (tutor_id) REFERENCES tutores (id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB; 
-- 3. SEGURIDAD: USUARIOS, ROLES Y PERMISOS
CREATE TABLE IF NOT EXISTS usuarios (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    estancia_default_id BIGINT UNSIGNED NULL,
    nombre VARCHAR(150) NOT NULL,
    correo VARCHAR(190) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    estatus VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
    intentos_fallidos SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    bloqueado_hasta DATETIME(6) NULL,
    ultimo_acceso_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),
    deleted_at DATETIME(6) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_usuarios_correo (correo),
    KEY idx_usuarios_estancia_estatus (estancia_default_id, estatus),
    CONSTRAINT fk_usuarios_estancia_default
        FOREIGN KEY (estancia_default_id) REFERENCES estancias (id)
        ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS roles (
    id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    codigo VARCHAR(50) NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    descripcion VARCHAR(255) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_roles_codigo (codigo)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS permisos (
    id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    codigo VARCHAR(80) NOT NULL,
    descripcion VARCHAR(255) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_permisos_codigo (codigo)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS usuario_rol (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    usuario_id BIGINT UNSIGNED NOT NULL,
    rol_id SMALLINT UNSIGNED NOT NULL,
    estancia_id BIGINT UNSIGNED NULL,
    vigente_desde DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    vigente_hasta DATETIME(6) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_usuario_rol_estancia (usuario_id, rol_id, estancia_id),
    KEY idx_usuario_rol_rol (rol_id),
    KEY idx_usuario_rol_estancia (estancia_id),
    CONSTRAINT fk_usuario_rol_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_usuario_rol_rol
        FOREIGN KEY (rol_id) REFERENCES roles (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_usuario_rol_estancia
        FOREIGN KEY (estancia_id) REFERENCES estancias (id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS rol_permiso (
    rol_id SMALLINT UNSIGNED NOT NULL,
    permiso_id SMALLINT UNSIGNED NOT NULL,
    PRIMARY KEY (rol_id, permiso_id),
    KEY idx_rol_permiso_permiso (permiso_id),
    CONSTRAINT fk_rol_permiso_rol
        FOREIGN KEY (rol_id) REFERENCES roles (id)
        ON UPDATE CASCADE ON DELETE CASCADE,
    CONSTRAINT fk_rol_permiso_permiso
        FOREIGN KEY (permiso_id) REFERENCES permisos (id)
        ON UPDATE CASCADE ON DELETE CASCADE
) ENGINE=InnoDB;

-- 4. PADRON E HISTORIAL DE INSCRIPCIONES
CREATE TABLE IF NOT EXISTS inscripciones (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    infante_id BIGINT UNSIGNED NOT NULL,
    estancia_id BIGINT UNSIGNED NOT NULL,
    sala_grupo_id BIGINT UNSIGNED NOT NULL,
    estrato VARCHAR(20) NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NULL,
    estatus VARCHAR(30) NOT NULL DEFAULT 'ACTIVA',
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),
    deleted_at DATETIME(6) NULL,
    PRIMARY KEY (id),
    KEY idx_inscripciones_infante_estatus (infante_id, estatus),
    KEY idx_inscripciones_estancia_estatus (estancia_id, estatus),
    KEY idx_inscripciones_sala_estatus (sala_grupo_id, estatus),
    CONSTRAINT fk_inscripciones_infante
        FOREIGN KEY (infante_id) REFERENCES infantes (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_inscripciones_estancia
        FOREIGN KEY (estancia_id) REFERENCES estancias (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_inscripciones_sala
        FOREIGN KEY (sala_grupo_id) REFERENCES salas_grupos (id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS movimientos_inscripcion (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    inscripcion_id BIGINT UNSIGNED NOT NULL,
    tipo_movimiento VARCHAR(40) NOT NULL,
    fecha_movimiento DATETIME(6) NOT NULL,
    estancia_anterior_id BIGINT UNSIGNED NULL,
    estancia_nueva_id BIGINT UNSIGNED NULL,
    sala_anterior_id BIGINT UNSIGNED NULL,
    sala_nueva_id BIGINT UNSIGNED NULL,
    estrato_anterior VARCHAR(20) NULL,
    estrato_nuevo VARCHAR(20) NULL,
    motivo VARCHAR(255) NULL,
    usuario_id BIGINT UNSIGNED NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    KEY idx_movimientos_inscripcion_fecha (inscripcion_id, fecha_movimiento),
    KEY idx_movimientos_usuario_fecha (usuario_id, fecha_movimiento),
    CONSTRAINT fk_movimientos_inscripcion
        FOREIGN KEY (inscripcion_id) REFERENCES inscripciones (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_movimientos_estancia_anterior
        FOREIGN KEY (estancia_anterior_id) REFERENCES estancias (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_movimientos_estancia_nueva
        FOREIGN KEY (estancia_nueva_id) REFERENCES estancias (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_movimientos_sala_anterior
        FOREIGN KEY (sala_anterior_id) REFERENCES salas_grupos (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_movimientos_sala_nueva
        FOREIGN KEY (sala_nueva_id) REFERENCES salas_grupos (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_movimientos_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- 5. PASE DE LISTA Y ASISTENCIA
CREATE TABLE IF NOT EXISTS jornadas_asistencia (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    estancia_id BIGINT UNSIGNED NOT NULL,
    fecha DATE NOT NULL,
    turno VARCHAR(20) NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'ABIERTA',
    abierta_at DATETIME(6) NOT NULL,
    cerrada_at DATETIME(6) NULL,
    abierta_por BIGINT UNSIGNED NOT NULL,
    cerrada_por BIGINT UNSIGNED NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_jornada_estancia_fecha_turno (estancia_id, fecha, turno),
    KEY idx_jornadas_fecha_estado (fecha, estado),
    CONSTRAINT fk_jornadas_estancia
        FOREIGN KEY (estancia_id) REFERENCES estancias (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_jornadas_abierta_por
        FOREIGN KEY (abierta_por) REFERENCES usuarios (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_jornadas_cerrada_por
        FOREIGN KEY (cerrada_por) REFERENCES usuarios (id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS asistencias (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    jornada_id BIGINT UNSIGNED NOT NULL,
    inscripcion_id BIGINT UNSIGNED NOT NULL,
    estado VARCHAR(30) NOT NULL,
    hora_entrada DATETIME(6) NULL,
    hora_salida DATETIME(6) NULL,
    metodo_registro VARCHAR(20) NOT NULL DEFAULT 'MANUAL',
    uuid_cliente CHAR(36) NOT NULL,
    registrado_por BIGINT UNSIGNED NOT NULL,
    registrado_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),
    anulada_at DATETIME(6) NULL,
    anulada_por BIGINT UNSIGNED NULL,
    motivo_anulacion VARCHAR(255) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_asistencia_jornada_inscripcion (jornada_id, inscripcion_id),
    UNIQUE KEY uq_asistencia_uuid_cliente (uuid_cliente),
    KEY idx_asistencias_jornada_estado (jornada_id, estado),
    KEY idx_asistencias_inscripcion_fecha (inscripcion_id, registrado_at),
    CONSTRAINT fk_asistencias_jornada
        FOREIGN KEY (jornada_id) REFERENCES jornadas_asistencia (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_asistencias_inscripcion
        FOREIGN KEY (inscripcion_id) REFERENCES inscripciones (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_asistencias_registrado_por
        FOREIGN KEY (registrado_por) REFERENCES usuarios (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_asistencias_anulada_por
        FOREIGN KEY (anulada_por) REFERENCES usuarios (id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS incidencias_asistencia (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    asistencia_id BIGINT UNSIGNED NOT NULL,
    tipo VARCHAR(50) NOT NULL,
    descripcion_cifrada LONGBLOB NULL,
    evidencia_storage_key VARCHAR(255) NULL,
    evidencia_sha256 BINARY(32) NULL,
    registrada_por BIGINT UNSIGNED NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),
    deleted_at DATETIME(6) NULL,
    PRIMARY KEY (id),
    KEY idx_incidencias_asistencia_fecha (asistencia_id, created_at),
    CONSTRAINT fk_incidencias_asistencia
        FOREIGN KEY (asistencia_id) REFERENCES asistencias (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_incidencias_usuario
        FOREIGN KEY (registrada_por) REFERENCES usuarios (id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- 6. SEGUIMIENTO DE AUSENCIAS
CREATE TABLE IF NOT EXISTS seguimientos (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    asistencia_id BIGINT UNSIGNED NOT NULL,
    clasificacion VARCHAR(30) NULL,
    estado VARCHAR(30) NOT NULL DEFAULT 'ABIERTO',
    fecha_probable_retorno DATE NULL,
    requiere_alta_medica TINYINT(1) NOT NULL DEFAULT 0,
    responsable_usuario_id BIGINT UNSIGNED NULL,
    abierto_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    cerrado_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),
    deleted_at DATETIME(6) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_seguimientos_asistencia (asistencia_id),
    KEY idx_seguimientos_estado_responsable (estado, responsable_usuario_id),
    KEY idx_seguimientos_retorno (fecha_probable_retorno),
    CONSTRAINT fk_seguimientos_asistencia
        FOREIGN KEY (asistencia_id) REFERENCES asistencias (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_seguimientos_responsable
        FOREIGN KEY (responsable_usuario_id) REFERENCES usuarios (id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS contactos_seguimiento (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    seguimiento_id BIGINT UNSIGNED NOT NULL,
    tutor_id BIGINT UNSIGNED NULL,
    numero_intento SMALLINT UNSIGNED NOT NULL,
    fecha_hora DATETIME(6) NOT NULL,
    canal VARCHAR(20) NOT NULL DEFAULT 'TELEFONO',
    resultado VARCHAR(40) NOT NULL,
    telefono_destino_cifrado VARBINARY(512) NULL,
    notas_asesoria_cifradas LONGBLOB NULL,
    proximo_intento_at DATETIME(6) NULL,
    registrado_por BIGINT UNSIGNED NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),
    deleted_at DATETIME(6) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_contacto_seguimiento_intento (seguimiento_id, numero_intento),
    KEY idx_contactos_fecha (seguimiento_id, fecha_hora),
    KEY idx_contactos_proximo_intento (proximo_intento_at),
    CONSTRAINT fk_contactos_seguimiento
        FOREIGN KEY (seguimiento_id) REFERENCES seguimientos (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_contactos_tutor
        FOREIGN KEY (tutor_id) REFERENCES tutores (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_contactos_usuario
        FOREIGN KEY (registrado_por) REFERENCES usuarios (id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS altas_medicas (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    seguimiento_id BIGINT UNSIGNED NOT NULL,
    fecha_alta DATE NOT NULL,
    medico_usuario_id BIGINT UNSIGNED NOT NULL,
    folio VARCHAR(100) NULL,
    observaciones_cifradas LONGBLOB NULL,
    documento_storage_key VARCHAR(255) NULL,
    documento_sha256 BINARY(32) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_alta_seguimiento (seguimiento_id),
    KEY idx_altas_medico_fecha (medico_usuario_id, fecha_alta),
    CONSTRAINT fk_altas_seguimiento
        FOREIGN KEY (seguimiento_id) REFERENCES seguimientos (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_altas_medico
        FOREIGN KEY (medico_usuario_id) REFERENCES usuarios (id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- 7. CONSENTIMIENTOS Y PRIVACIDAD
CREATE TABLE IF NOT EXISTS consentimientos (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    infante_id BIGINT UNSIGNED NOT NULL,
    tutor_id BIGINT UNSIGNED NOT NULL,
    tipo VARCHAR(60) NOT NULL,
    version_aviso VARCHAR(30) NOT NULL,
    aceptado TINYINT(1) NOT NULL,
    aceptado_at DATETIME(6) NOT NULL,
    revocado_at DATETIME(6) NULL,
    evidencia_storage_key VARCHAR(255) NULL,
    evidencia_sha256 BINARY(32) NULL,
    registrado_por BIGINT UNSIGNED NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    KEY idx_consentimientos_infante_tipo (infante_id, tipo, aceptado_at),
    KEY idx_consentimientos_tutor (tutor_id),
    CONSTRAINT fk_consentimientos_infante
        FOREIGN KEY (infante_id) REFERENCES infantes (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_consentimientos_tutor
        FOREIGN KEY (tutor_id) REFERENCES tutores (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_consentimientos_usuario
        FOREIGN KEY (registrado_por) REFERENCES usuarios (id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- 8. MODO DESCONECTADO Y SINCRONIZACION
CREATE TABLE IF NOT EXISTS dispositivos (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    estancia_id BIGINT UNSIGNED NOT NULL,
    identificador_publico CHAR(36) NOT NULL,
    nombre VARCHAR(100) NOT NULL,
    token_hash BINARY(32) NOT NULL,
    estatus VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
    ultimo_acceso_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
        ON UPDATE CURRENT_TIMESTAMP(6),
    revoked_at DATETIME(6) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_dispositivos_identificador (identificador_publico),
    UNIQUE KEY uq_dispositivos_token_hash (token_hash),
    KEY idx_dispositivos_estancia_estatus (estancia_id, estatus),
    CONSTRAINT fk_dispositivos_estancia
        FOREIGN KEY (estancia_id) REFERENCES estancias (id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS sincronizaciones (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    dispositivo_id BIGINT UNSIGNED NOT NULL,
    uuid_operacion CHAR(36) NOT NULL,
    entidad VARCHAR(50) NOT NULL,
    operacion VARCHAR(20) NOT NULL,
    fecha_captura_local DATETIME(6) NOT NULL,
    fecha_recepcion_servidor DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    estado VARCHAR(20) NOT NULL,
    payload_sha256 BINARY(32) NULL,
    mensaje_error VARCHAR(1000) NULL,
    reintentos SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (id),
    UNIQUE KEY uq_sincronizaciones_uuid (uuid_operacion),
    KEY idx_sincronizaciones_dispositivo_estado
        (dispositivo_id, estado, fecha_recepcion_servidor),
    CONSTRAINT fk_sincronizaciones_dispositivo
        FOREIGN KEY (dispositivo_id) REFERENCES dispositivos (id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- 9. AUDITORIA INMUTABLE
CREATE TABLE IF NOT EXISTS auditoria (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    usuario_id BIGINT UNSIGNED NULL,
    rol_codigo VARCHAR(50) NULL,
    accion VARCHAR(30) NOT NULL,
    tabla_afectada VARCHAR(80) NOT NULL,
    registro_id VARCHAR(100) NULL,
    datos_anteriores_cifrados LONGBLOB NULL,
    datos_nuevos_cifrados LONGBLOB NULL,
    ip_origen VARBINARY(16) NULL,
    user_agent VARCHAR(512) NULL,
    request_id CHAR(36) NULL,
    ocurrido_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    KEY idx_auditoria_usuario_fecha (usuario_id, ocurrido_at),
    KEY idx_auditoria_registro
        (tabla_afectada, registro_id, ocurrido_at),
    KEY idx_auditoria_request_id (request_id),
    CONSTRAINT fk_auditoria_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
        ON UPDATE CASCADE ON DELETE SET NULL
) ENGINE=InnoDB;

-- 10. CATALOGOS INICIALES DE SEGURIDAD
INSERT INTO roles (codigo, nombre, descripcion) VALUES
    ('DIRECTORA', 'Directora de estancia', 'Supervision operativa de la estancia'),
    ('DOCENTE', 'Docente o educadora', 'Consulta y registro operativo de asistencia'),
    ('TRABAJO_SOCIAL', 'Trabajo social', 'Seguimiento de ausencias y contacto con tutores'),
    ('ENFERMERIA', 'Enfermeria', 'Seguimiento de salud dentro de la estancia'),
    ('MEDICO', 'Medico de estancia', 'Consulta medica y alta de casos'),
    ('SUPERVISOR_CENTRAL', 'Supervisor central', 'Consulta de indicadores agregados'),
    ('ADMIN_CENTRAL', 'Administrador central', 'Administracion tecnica y de seguridad')
ON DUPLICATE KEY UPDATE
    nombre = VALUES(nombre),
    descripcion = VALUES(descripcion);

INSERT INTO permisos (codigo, descripcion) VALUES
    ('ASISTENCIA_CONSULTAR', 'Consultar el pase de lista autorizado'),
    ('ASISTENCIA_REGISTRAR', 'Registrar o modificar asistencia durante una jornada abierta'),
    ('JORNADA_CERRAR', 'Cerrar una jornada de asistencia'),
    ('SEGUIMIENTO_CONSULTAR', 'Consultar casos de seguimiento autorizados'),
    ('SEGUIMIENTO_REGISTRAR', 'Registrar llamadas y acciones de seguimiento'),
    ('NOTA_SENSIBLE_CONSULTAR', 'Consultar notas medicas o familiares cifradas'),
    ('ALTA_MEDICA_REGISTRAR', 'Registrar el alta medica de un caso'),
    ('REPORTE_AGREGADO_CONSULTAR', 'Consultar reportes sin datos personales'),
    ('USUARIO_ADMINISTRAR', 'Administrar usuarios, roles y permisos'),
    ('AUDITORIA_CONSULTAR', 'Consultar la bitacora de auditoria')
ON DUPLICATE KEY UPDATE
    descripcion = VALUES(descripcion);
    
-- 11. VISTAS DE APOYO PARA EL SISTEMA
CREATE OR REPLACE VIEW vw_asistencia_diaria AS
SELECT
    a.id AS asistencia_id,
    j.fecha,
    j.turno,
    e.id AS estancia_id,
    e.clave_ebdi,
    sg.id AS sala_grupo_id,
    sg.nombre AS sala_grupo,
    i.id AS infante_id,
    i.matricula,
    CONCAT_WS(' ', i.nombre, i.apellido_paterno, i.apellido_materno) AS infante,
    a.estado,
    a.hora_entrada,
    a.hora_salida,
    a.metodo_registro
FROM asistencias AS a
INNER JOIN jornadas_asistencia AS j ON j.id = a.jornada_id
INNER JOIN inscripciones AS ins ON ins.id = a.inscripcion_id
INNER JOIN infantes AS i ON i.id = ins.infante_id
INNER JOIN estancias AS e ON e.id = j.estancia_id
INNER JOIN salas_grupos AS sg ON sg.id = ins.sala_grupo_id
WHERE a.anulada_at IS NULL;

CREATE OR REPLACE VIEW vw_seguimientos_abiertos AS
SELECT
    s.id AS seguimiento_id,
    s.estado,
    s.clasificacion,
    s.fecha_probable_retorno,
    s.requiere_alta_medica,
    j.fecha AS fecha_ausencia,
    e.clave_ebdi,
    i.matricula,
    CONCAT_WS(' ', i.nombre, i.apellido_paterno, i.apellido_materno) AS infante,
    s.responsable_usuario_id
FROM seguimientos AS s
INNER JOIN asistencias AS a ON a.id = s.asistencia_id
INNER JOIN jornadas_asistencia AS j ON j.id = a.jornada_id
INNER JOIN inscripciones AS ins ON ins.id = a.inscripcion_id
INNER JOIN infantes AS i ON i.id = ins.infante_id
INNER JOIN estancias AS e ON e.id = j.estancia_id
WHERE s.estado <> 'CERRADO'
  AND s.deleted_at IS NULL;

