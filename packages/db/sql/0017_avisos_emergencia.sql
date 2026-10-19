-- Avisos a los contactos de emergencia (RF-27). Cuando el segundo intento de
-- localizar al tutor también falla, se deja un aviso por cada contacto de
-- emergencia del infante, en la misma transacción que el intento. Un proceso
-- los envía por WhatsApp; si el envío falla o no hay cuenta configurada, la fila
-- sigue ahí. El aviso no guarda el texto ni el número: el texto es fijo y no
-- nombra al menor, y el teléfono se lee cifrado del tutor al enviar.
CREATE TABLE IF NOT EXISTS avisos_emergencia (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    seguimiento_id BIGINT UNSIGNED NOT NULL,
    tutor_id BIGINT UNSIGNED NOT NULL,
    estado VARCHAR(20) NOT NULL DEFAULT 'PENDIENTE',
    intentos SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    proximo_intento_at DATETIME(6) NULL,
    enviado_at DATETIME(6) NULL,
    mensaje_externo_id VARCHAR(100) NULL,
    error_codigo VARCHAR(60) NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    deleted_at DATETIME(6) NULL,
    deleted_by BIGINT UNSIGNED NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_avisos_seguimiento_tutor (seguimiento_id, tutor_id),
    KEY idx_avisos_pendientes (estado, proximo_intento_at),
    CONSTRAINT ck_avisos_estado CHECK (estado IN ('PENDIENTE', 'ENVIADO', 'FALLIDO', 'SIN_TELEFONO')),
    CONSTRAINT ck_avisos_envio CHECK ((estado = 'ENVIADO') = (enviado_at IS NOT NULL)),
    CONSTRAINT fk_avisos_seguimiento FOREIGN KEY (seguimiento_id) REFERENCES seguimientos (id),
    CONSTRAINT fk_avisos_tutor FOREIGN KEY (tutor_id) REFERENCES tutores (id),
    CONSTRAINT fk_avisos_deleted_by FOREIGN KEY (deleted_by) REFERENCES usuarios (id)
) ENGINE=InnoDB;
