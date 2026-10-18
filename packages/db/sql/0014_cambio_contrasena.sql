-- Cambio de contraseña (RF-38). Quien ingresa con una contraseña temporal debe
-- cambiarla antes de usar el sistema, y la temporal caduca (supuesto S-19).
ALTER TABLE usuarios
    ADD COLUMN debe_cambiar_password TINYINT(1) NOT NULL DEFAULT 0 AFTER password_hash,
    ADD COLUMN password_temporal_expira_at DATETIME(6) NULL AFTER debe_cambiar_password,
    ADD COLUMN password_cambiado_at DATETIME(6) NULL AFTER password_temporal_expira_at;

-- Solo una contraseña temporal puede tener fecha de caducidad.
ALTER TABLE usuarios
    ADD CONSTRAINT ck_usuarios_temporal_caduca CHECK (debe_cambiar_password = 1 OR password_temporal_expira_at IS NULL);
