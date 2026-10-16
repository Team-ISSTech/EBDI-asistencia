-- Expediente de un infante para traslados (RF-19): permiso de exportación y
-- registro de cada expediente emitido, con su folio (el id) y su sello.
-- El sello es una huella con llave del servidor (HMAC-SHA256) sobre el folio,
-- el infante, la fecha y el contenido; permite verificar que un PDF es auténtico.
INSERT INTO permisos (codigo, descripcion) VALUES
    ('EXPEDIENTE_EXPORTAR', 'Exportar el expediente de un infante a PDF para traslados entre estancias')
ON DUPLICATE KEY UPDATE
    descripcion = VALUES(descripcion);

CREATE TABLE IF NOT EXISTS expedientes_emitidos (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    infante_id BIGINT UNSIGNED NOT NULL,
    estancia_id BIGINT UNSIGNED NOT NULL,
    emitido_por BIGINT UNSIGNED NOT NULL,
    emitido_at DATETIME(6) NOT NULL,
    contenido_sha256 BINARY(32) NOT NULL,
    sello BINARY(32) NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    KEY idx_expedientes_infante (infante_id, emitido_at),
    KEY idx_expedientes_estancia (estancia_id, emitido_at),
    CONSTRAINT fk_expedientes_infante
        FOREIGN KEY (infante_id) REFERENCES infantes (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_expedientes_estancia
        FOREIGN KEY (estancia_id) REFERENCES estancias (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    CONSTRAINT fk_expedientes_usuario
        FOREIGN KEY (emitido_por) REFERENCES usuarios (id)
        ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB;

-- El sello se calcula con el folio, que es el id: por eso se inserta sin sello y
-- se sella una sola vez. Un expediente sellado no se modifica ni se borra.
DROP TRIGGER IF EXISTS trg_expedientes_sin_cambios;
DROP TRIGGER IF EXISTS trg_expedientes_sin_borrado;

CREATE TRIGGER trg_expedientes_sin_cambios
BEFORE UPDATE ON expedientes_emitidos
FOR EACH ROW
IF OLD.sello IS NOT NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Un expediente sellado es inmutable';
END IF;

CREATE TRIGGER trg_expedientes_sin_borrado
BEFORE DELETE ON expedientes_emitidos
FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Un expediente emitido es inmutable';
