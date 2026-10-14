-- Ajustes al esquema base acordados en docs/architecture/data-model.md:
-- P2 (deleted_by), P5 (grupo_discapacidad cifrado), P8 (ciclos escolares) y
-- P9 (alcance regional del rol). Las tablas afectadas aún no tienen filas:
-- ningún módulo escribe en ellas todavía, por eso las columnas nuevas
-- pueden ser NOT NULL y el cambio de grupo_discapacidad no migra datos.

-- P2. Borrado lógico atribuible: quién marcó el deleted_at.
ALTER TABLE estancias
    ADD COLUMN deleted_by BIGINT UNSIGNED NULL AFTER deleted_at,
    ADD CONSTRAINT fk_estancias_deleted_by
        FOREIGN KEY (deleted_by) REFERENCES usuarios (id)
        ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE salas_grupos
    ADD COLUMN deleted_by BIGINT UNSIGNED NULL AFTER deleted_at,
    ADD CONSTRAINT fk_salas_grupos_deleted_by
        FOREIGN KEY (deleted_by) REFERENCES usuarios (id)
        ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE infantes
    ADD COLUMN deleted_by BIGINT UNSIGNED NULL AFTER deleted_at,
    ADD CONSTRAINT fk_infantes_deleted_by
        FOREIGN KEY (deleted_by) REFERENCES usuarios (id)
        ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE tutores
    ADD COLUMN deleted_by BIGINT UNSIGNED NULL AFTER deleted_at,
    ADD CONSTRAINT fk_tutores_deleted_by
        FOREIGN KEY (deleted_by) REFERENCES usuarios (id)
        ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE usuarios
    ADD COLUMN deleted_by BIGINT UNSIGNED NULL AFTER deleted_at,
    ADD CONSTRAINT fk_usuarios_deleted_by
        FOREIGN KEY (deleted_by) REFERENCES usuarios (id)
        ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE inscripciones
    ADD COLUMN deleted_by BIGINT UNSIGNED NULL AFTER deleted_at,
    ADD CONSTRAINT fk_inscripciones_deleted_by
        FOREIGN KEY (deleted_by) REFERENCES usuarios (id)
        ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE incidencias_asistencia
    ADD COLUMN deleted_by BIGINT UNSIGNED NULL AFTER deleted_at,
    ADD CONSTRAINT fk_incidencias_asistencia_deleted_by
        FOREIGN KEY (deleted_by) REFERENCES usuarios (id)
        ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE seguimientos
    ADD COLUMN deleted_by BIGINT UNSIGNED NULL AFTER deleted_at,
    ADD CONSTRAINT fk_seguimientos_deleted_by
        FOREIGN KEY (deleted_by) REFERENCES usuarios (id)
        ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE contactos_seguimiento
    ADD COLUMN deleted_by BIGINT UNSIGNED NULL AFTER deleted_at,
    ADD CONSTRAINT fk_contactos_seguimiento_deleted_by
        FOREIGN KEY (deleted_by) REFERENCES usuarios (id)
        ON UPDATE CASCADE ON DELETE RESTRICT;

-- P5. La discapacidad es dato de salud: se guarda cifrada. Los reportes
-- agrupan por tiene_discapacidad, que sigue en claro.
ALTER TABLE infantes
    DROP COLUMN grupo_discapacidad,
    ADD COLUMN grupo_discapacidad_cifrado VARBINARY(512) NULL AFTER tiene_discapacidad;

-- P8. Retención: cada jornada e inscripción pertenece a un ciclo escolar;
-- al archivarse el ciclo, sus datos pasan a archivo histórico.
CREATE TABLE IF NOT EXISTS ciclos_escolares (
    id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
    codigo VARCHAR(20) NOT NULL,
    fecha_inicio DATE NOT NULL,
    fecha_fin DATE NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
    archivado_at DATETIME(6) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_ciclos_escolares_codigo (codigo),
    KEY idx_ciclos_escolares_estado (estado),
    CONSTRAINT ck_ciclos_escolares_estado CHECK (estado IN ('ACTIVO', 'ARCHIVADO')),
    CONSTRAINT ck_ciclos_escolares_fechas CHECK (fecha_fin >= fecha_inicio)
) ENGINE=InnoDB;

ALTER TABLE jornadas_asistencia
    ADD COLUMN ciclo_escolar_id SMALLINT UNSIGNED NOT NULL AFTER estancia_id,
    ADD KEY idx_jornadas_ciclo (ciclo_escolar_id),
    ADD CONSTRAINT fk_jornadas_ciclo
        FOREIGN KEY (ciclo_escolar_id) REFERENCES ciclos_escolares (id)
        ON UPDATE CASCADE ON DELETE RESTRICT;

ALTER TABLE inscripciones
    ADD COLUMN ciclo_escolar_id SMALLINT UNSIGNED NOT NULL AFTER sala_grupo_id,
    ADD KEY idx_inscripciones_ciclo (ciclo_escolar_id),
    ADD CONSTRAINT fk_inscripciones_ciclo
        FOREIGN KEY (ciclo_escolar_id) REFERENCES ciclos_escolares (id)
        ON UPDATE CASCADE ON DELETE RESTRICT;

-- P9. Un solo rol SUPERVISOR_CENTRAL; su alcance se acota por región.
ALTER TABLE usuario_rol
    ADD COLUMN region VARCHAR(100) NULL AFTER estancia_id;
