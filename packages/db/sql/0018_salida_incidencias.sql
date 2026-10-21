-- Salida e incidencias del día (supuesto S-27). La salida guarda quién recogió
-- al infante (un tutor autorizado, RF-34) y quién la registró; los tres datos
-- van juntos. Sin acciones en cascada: MySQL no las admite en columnas que un
-- CHECK usa. La lista de tipos debe coincidir con packages/domain; una prueba lo comprueba.
ALTER TABLE asistencias
    ADD COLUMN recogido_por BIGINT UNSIGNED NULL AFTER hora_salida,
    ADD COLUMN salida_registrada_por BIGINT UNSIGNED NULL AFTER recogido_por,
    ADD CONSTRAINT fk_asistencias_recogido_por
        FOREIGN KEY (recogido_por) REFERENCES tutores (id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    ADD CONSTRAINT fk_asistencias_salida_registrada_por
        FOREIGN KEY (salida_registrada_por) REFERENCES usuarios (id)
        ON UPDATE RESTRICT ON DELETE RESTRICT,
    ADD CONSTRAINT ck_asistencias_salida CHECK (
        (hora_salida IS NULL) = (recogido_por IS NULL)
        AND (hora_salida IS NULL) = (salida_registrada_por IS NULL)
    );

ALTER TABLE incidencias_asistencia
    ADD CONSTRAINT ck_incidencias_tipo CHECK (tipo IN ('ACCIDENTE', 'ENFERMEDAD', 'CONDUCTA', 'OTRA'));
