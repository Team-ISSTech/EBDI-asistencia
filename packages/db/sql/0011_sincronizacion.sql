-- Operación sin conexión (RF-20 a RF-23). `sincronizaciones` guarda el acuse de
-- cada operación enviada al reconectar: si la tablet reintenta la misma, el
-- servidor devuelve la respuesta guardada y no repite el efecto. El
-- dispositivo es opcional: hoy la operación se atribuye a la sesión (usuario
-- y estancia). Las tablas de la fase 0 no tienen filas, por eso las columnas
-- nuevas pueden ser NOT NULL.
ALTER TABLE sincronizaciones
    DROP FOREIGN KEY fk_sincronizaciones_dispositivo,
    MODIFY COLUMN dispositivo_id BIGINT UNSIGNED NULL;

ALTER TABLE sincronizaciones
    ADD COLUMN usuario_id BIGINT UNSIGNED NOT NULL AFTER dispositivo_id,
    ADD COLUMN estancia_id BIGINT UNSIGNED NOT NULL AFTER usuario_id,
    ADD COLUMN respuesta_json JSON NULL,
    ADD CONSTRAINT fk_sincronizaciones_dispositivo
        FOREIGN KEY (dispositivo_id) REFERENCES dispositivos (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    ADD CONSTRAINT fk_sincronizaciones_usuario
        FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    ADD CONSTRAINT fk_sincronizaciones_estancia
        FOREIGN KEY (estancia_id) REFERENCES estancias (id)
        ON UPDATE CASCADE ON DELETE RESTRICT,
    ADD KEY idx_sincronizaciones_estancia (estancia_id, fecha_recepcion_servidor),
    ADD CONSTRAINT ck_sincronizaciones_estado CHECK (estado IN ('APLICADA', 'PARCIAL', 'RECHAZADA')),
    ADD CONSTRAINT ck_sincronizaciones_entidad CHECK (entidad IN ('ASISTENCIA', 'CONTACTO_SEGUIMIENTO')),
    ADD CONSTRAINT ck_sincronizaciones_operacion CHECK (operacion IN ('REGISTRAR'));

-- Una llamada de seguimiento capturada sin conexión no se duplica al reintentar:
-- la base misma lo impide con el UUID de la operación (igual que `uuid_cliente`
-- en las asistencias).
ALTER TABLE contactos_seguimiento
    ADD COLUMN uuid_operacion CHAR(36) NULL AFTER proximo_intento_at,
    ADD UNIQUE KEY uq_contacto_uuid_operacion (uuid_operacion);
