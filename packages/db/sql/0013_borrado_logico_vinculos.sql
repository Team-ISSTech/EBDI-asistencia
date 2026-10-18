-- Dar de baja un vínculo infante-tutor que nunca tuvo vigencia (se creó por
-- error el mismo día) no puede dejar historia, pero tampoco se borra la fila
-- (RNF-04): se marca con quién y cuándo, igual que el resto de los catálogos.
ALTER TABLE infante_tutor
    ADD COLUMN deleted_at DATETIME(6) NULL AFTER updated_at,
    ADD COLUMN deleted_by BIGINT UNSIGNED NULL AFTER deleted_at;

ALTER TABLE infante_tutor
    ADD CONSTRAINT fk_infante_tutor_deleted_by FOREIGN KEY (deleted_by) REFERENCES usuarios (id);
