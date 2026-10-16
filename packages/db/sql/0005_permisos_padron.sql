-- Permisos del padrón de infantes (decisión P10: se agregan al iniciar el
-- módulo). La asignación a roles la sincroniza la semilla desde
-- packages/auth, que es la fuente de verdad de la matriz.
INSERT INTO permisos (codigo, descripcion) VALUES
    ('INFANTE_CONSULTAR', 'Consultar el padrón de infantes, tutores y salas de la estancia'),
    ('INFANTE_ADMINISTRAR', 'Dar de alta, editar y dar de baja infantes, tutores e inscripciones'),
    ('CONSENTIMIENTO_REGISTRAR', 'Registrar o revocar el consentimiento del tutor')
ON DUPLICATE KEY UPDATE
    descripcion = VALUES(descripcion);
