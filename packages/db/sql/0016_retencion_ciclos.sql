-- Retención por ciclo escolar (RNF-05). Un ciclo archivado queda de solo lectura
-- y se conserva 5 años; cumplidos, el administrador central puede depurarlo, lo
-- que vacía los datos sensibles cifrados de sus seguimientos sin borrar filas
-- (RNF-04): quedan los conteos, los estados y la huella de auditoría.
ALTER TABLE ciclos_escolares
    ADD COLUMN archivado_por BIGINT UNSIGNED NULL AFTER archivado_at,
    ADD COLUMN depurado_at DATETIME(6) NULL AFTER archivado_por,
    ADD COLUMN depurado_por BIGINT UNSIGNED NULL AFTER depurado_at,
    -- Como mucho un ciclo activo: el alta de infantes y de jornadas usa "el" ciclo activo.
    ADD COLUMN activo_unico TINYINT GENERATED ALWAYS AS (IF(estado = 'ACTIVO', 1, NULL)) STORED,
    ADD UNIQUE KEY uq_ciclos_un_activo (activo_unico),
    ADD CONSTRAINT fk_ciclos_archivado_por FOREIGN KEY (archivado_por) REFERENCES usuarios (id),
    ADD CONSTRAINT fk_ciclos_depurado_por FOREIGN KEY (depurado_por) REFERENCES usuarios (id),
    ADD CONSTRAINT ck_ciclos_depurado CHECK (depurado_at IS NULL OR (estado = 'ARCHIVADO' AND archivado_at IS NOT NULL AND depurado_at >= archivado_at));

-- La asignación al rol la sincroniza la semilla desde packages/auth.
INSERT INTO permisos (codigo, descripcion) VALUES
    ('CICLO_ADMINISTRAR', 'Abrir el ciclo escolar nuevo (archiva el anterior) y depurar los ciclos archivados hace más de 5 años')
ON DUPLICATE KEY UPDATE
    descripcion = VALUES(descripcion);
