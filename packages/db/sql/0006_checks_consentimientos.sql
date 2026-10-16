-- Consentimientos del tutor: tipos válidos (iguales a packages/domain) y la
-- regla de que solo una aceptación puede revocarse. Revocar marca revocado_at;
-- nunca se borra la fila, para conservar la evidencia.
ALTER TABLE consentimientos
    ADD CONSTRAINT ck_consentimientos_tipo CHECK (tipo IN ('TRATAMIENTO_DATOS_SENSIBLES', 'CONTACTO_TELEFONICO')),
    ADD CONSTRAINT ck_consentimientos_revocacion CHECK (revocado_at IS NULL OR aceptado = 1);
