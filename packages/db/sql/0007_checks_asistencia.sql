-- Valores válidos de jornadas y registros de asistencia (decisión P11). Las
-- listas deben coincidir con packages/domain; una prueba lo comprueba.
ALTER TABLE jornadas_asistencia
    ADD CONSTRAINT ck_jornadas_estado CHECK (estado IN ('ABIERTA', 'CERRADA')),
    ADD CONSTRAINT ck_jornadas_turno CHECK (turno IN ('MATUTINO', 'VESPERTINO'));

ALTER TABLE asistencias
    ADD CONSTRAINT ck_asistencias_estado CHECK (estado IN ('PRESENTE', 'AUSENTE_JUSTIFICADO', 'FALTA_INJUSTIFICADA', 'COMISION_MEDICA', 'FILTRO_SANITARIO')),
    ADD CONSTRAINT ck_asistencias_metodo CHECK (metodo_registro IN ('MANUAL', 'QR'));
