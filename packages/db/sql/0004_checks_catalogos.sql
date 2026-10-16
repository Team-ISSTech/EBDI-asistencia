-- Valores válidos de turno y estatus en los catálogos (decisión P11).
-- Las listas deben coincidir con packages/domain/src/catalogs.ts; una prueba
-- lo comprueba. Las tablas de asistencia y seguimiento agregan sus CHECK en
-- la migración de su módulo.
ALTER TABLE estancias
    ADD CONSTRAINT ck_estancias_estatus CHECK (estatus IN ('ACTIVA', 'INACTIVA'));

ALTER TABLE salas_grupos
    ADD CONSTRAINT ck_salas_estatus CHECK (estatus IN ('ACTIVO', 'INACTIVO')),
    ADD CONSTRAINT ck_salas_turno CHECK (turno IN ('MATUTINO', 'VESPERTINO')),
    ADD CONSTRAINT ck_salas_edades CHECK (
        edad_minima_meses IS NULL OR edad_maxima_meses IS NULL
        OR edad_minima_meses <= edad_maxima_meses
    );

ALTER TABLE infantes
    ADD CONSTRAINT ck_infantes_estatus CHECK (estatus IN ('ACTIVO', 'BAJA'));

ALTER TABLE tutores
    ADD CONSTRAINT ck_tutores_estatus CHECK (estatus IN ('ACTIVO', 'INACTIVO'));

ALTER TABLE inscripciones
    ADD CONSTRAINT ck_inscripciones_estatus CHECK (estatus IN ('ACTIVA', 'BAJA', 'TRASLADADA')),
    ADD CONSTRAINT ck_inscripciones_fechas CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio);

ALTER TABLE movimientos_inscripcion
    ADD CONSTRAINT ck_movimientos_tipo CHECK (tipo_movimiento IN ('ALTA', 'CAMBIO_SALA', 'TRASLADO', 'BAJA'));

ALTER TABLE infante_tutor
    ADD CONSTRAINT ck_infante_tutor_vigencia CHECK (vigencia_hasta IS NULL OR vigencia_hasta >= vigencia_desde);
