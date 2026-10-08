-- La bitácora es inmutable también en el motor (RNF-02), no solo por
-- convención de la API: cualquier UPDATE o DELETE falla. Complemento: el
-- usuario de base de datos de la API debe tener solo INSERT y SELECT sobre
-- esta tabla (ver manual de instalación, F4).
--
-- Requisito del motor: con binlog activo, crear triggers exige privilegio
-- SUPER o `log_bin_trust_function_creators=1` (docker-compose.yml y CI lo
-- fijan; en producción lo habilita el DBA al aplicar esta migración).
DROP TRIGGER IF EXISTS trg_auditoria_sin_update;
DROP TRIGGER IF EXISTS trg_auditoria_sin_delete;

CREATE TRIGGER trg_auditoria_sin_update
BEFORE UPDATE ON auditoria
FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La tabla auditoria es inmutable';

CREATE TRIGGER trg_auditoria_sin_delete
BEFORE DELETE ON auditoria
FOR EACH ROW
SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'La tabla auditoria es inmutable';

-- Borrar un usuario (aunque sea lógico) nunca debe poder vaciar su rastro.
ALTER TABLE auditoria DROP FOREIGN KEY fk_auditoria_usuario;
ALTER TABLE auditoria
    ADD CONSTRAINT fk_auditoria_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
        ON UPDATE CASCADE ON DELETE RESTRICT;
