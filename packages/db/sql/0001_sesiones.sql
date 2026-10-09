-- Sesiones en servidor (decisión P7 en docs/architecture/decisions.md).
-- El token nunca se guarda en claro: solo su SHA-256.
CREATE TABLE IF NOT EXISTS sesiones (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    usuario_id BIGINT UNSIGNED NOT NULL,
    estancia_activa_id BIGINT UNSIGNED NULL,
    token_hash BINARY(32) NOT NULL,
    ip_origen VARBINARY(16) NULL,
    user_agent VARCHAR(512) NULL,
    expira_at DATETIME(6) NOT NULL,
    revocada_at DATETIME(6) NULL,
    ultimo_uso_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_sesiones_token_hash (token_hash),
    KEY idx_sesiones_usuario_expira (usuario_id, expira_at),
    CONSTRAINT fk_sesiones_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_sesiones_estancia_activa
        FOREIGN KEY (estancia_activa_id) REFERENCES estancias (id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;
