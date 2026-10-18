-- Sistemas externos que consumen la API con Bearer token (RF-37). Un sistema no
-- es un usuario: no tiene correo ni contraseña ni roles, solo credenciales de
-- máquina y alcances. El secreto se guarda con hash (argon2id) y nunca se
-- puede volver a leer; revocar no borra la fila (RNF-04).
CREATE TABLE IF NOT EXISTS sistemas_integracion (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    nombre VARCHAR(100) NOT NULL,
    client_id CHAR(32) NOT NULL,
    secret_hash VARCHAR(255) NOT NULL,
    alcances VARCHAR(255) NOT NULL,
    estatus VARCHAR(20) NOT NULL DEFAULT 'ACTIVO',
    ultimo_uso_at DATETIME(6) NULL,
    creado_por BIGINT UNSIGNED NOT NULL,
    revocado_at DATETIME(6) NULL,
    revocado_por BIGINT UNSIGNED NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_sistemas_client_id (client_id),
    KEY idx_sistemas_estatus (estatus),
    CONSTRAINT ck_sistemas_estatus CHECK (estatus IN ('ACTIVO', 'REVOCADO')),
    CONSTRAINT ck_sistemas_alcances CHECK (CHAR_LENGTH(alcances) > 0),
    CONSTRAINT ck_sistemas_revocado CHECK ((estatus = 'REVOCADO') = (revocado_at IS NOT NULL)),
    CONSTRAINT fk_sistemas_creado_por FOREIGN KEY (creado_por) REFERENCES usuarios (id),
    CONSTRAINT fk_sistemas_revocado_por FOREIGN KEY (revocado_por) REFERENCES usuarios (id)
) ENGINE=InnoDB;

-- La bitácora puede nombrar a un sistema como quien hizo la operación.
ALTER TABLE auditoria
    ADD COLUMN sistema_id BIGINT UNSIGNED NULL AFTER usuario_id,
    ADD KEY idx_auditoria_sistema_fecha (sistema_id, ocurrido_at),
    ADD CONSTRAINT fk_auditoria_sistema FOREIGN KEY (sistema_id) REFERENCES sistemas_integracion (id)
        ON UPDATE CASCADE ON DELETE RESTRICT;

-- La asignación al rol la sincroniza la semilla desde packages/auth.
INSERT INTO permisos (codigo, descripcion) VALUES
    ('SISTEMA_ADMINISTRAR', 'Registrar, consultar y revocar sistemas externos que usan la API')
ON DUPLICATE KEY UPDATE
    descripcion = VALUES(descripcion);
