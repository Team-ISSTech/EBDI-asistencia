-- Contactos de seguimiento (RF-25): el canal es el teléfono y el resultado es
-- uno de los de packages/domain (una prueba lo comprueba).
ALTER TABLE contactos_seguimiento
    ADD CONSTRAINT ck_contactos_resultado CHECK (resultado IN ('CONTACTADO', 'SIN_RESPUESTA')),
    ADD CONSTRAINT ck_contactos_canal CHECK (canal IN ('TELEFONO'));
