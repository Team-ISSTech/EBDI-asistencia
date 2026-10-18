-- Permisos del catálogo de estancias y de salas (decisión P10: se agregan al
-- iniciar el módulo). La asignación a roles la sincroniza la semilla desde
-- packages/auth: ESTANCIA_ADMINISTRAR al administrador central y
-- SALA_ADMINISTRAR a la directora.
INSERT INTO permisos (codigo, descripcion) VALUES
    ('ESTANCIA_ADMINISTRAR', 'Crear, editar y dar de baja estancias'),
    ('SALA_ADMINISTRAR', 'Crear, editar y dar de baja salas y grupos de la estancia')
ON DUPLICATE KEY UPDATE
    descripcion = VALUES(descripcion);
