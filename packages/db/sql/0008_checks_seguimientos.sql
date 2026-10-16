-- Valores válidos del seguimiento de ausencias (decisión P11): iguales a
-- packages/domain, y una prueba lo comprueba. La clasificación puede ser NULL
-- mientras el ticket sigue ABIERTO. Además, solo un ticket cerrado tiene fecha
-- de cierre (deleted_by ya lo agregó la migración 0003).
ALTER TABLE seguimientos
    ADD CONSTRAINT ck_seguimientos_estado CHECK (estado IN ('ABIERTO', 'CLASIFICADO', 'CERRADO')),
    ADD CONSTRAINT ck_seguimientos_clasificacion CHECK (clasificacion IN ('ENF_CASA', 'ACC_EXT', 'PER_TUT', 'NO_LOC')),
    ADD CONSTRAINT ck_seguimientos_cierre CHECK ((estado = 'CERRADO') = (cerrado_at IS NOT NULL));
