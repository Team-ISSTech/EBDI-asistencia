/**
 * Códigos de permiso. Coinciden con la semilla de la tabla `permisos` del
 * esquema del equipo. Un permiso describe una capacidad, nunca una pantalla.
 */
export const PERMISSION_CODES = [
  'ASISTENCIA_CONSULTAR',
  'ASISTENCIA_REGISTRAR',
  'JORNADA_CERRAR',
  'SEGUIMIENTO_CONSULTAR',
  'SEGUIMIENTO_REGISTRAR',
  'NOTA_SENSIBLE_CONSULTAR',
  'ALTA_MEDICA_REGISTRAR',
  'REPORTE_AGREGADO_CONSULTAR',
  'USUARIO_ADMINISTRAR',
  'AUDITORIA_CONSULTAR',
] as const;

export type PermissionCode = (typeof PERMISSION_CODES)[number];

export const isPermissionCode = (value: unknown): value is PermissionCode =>
  typeof value === 'string' && (PERMISSION_CODES as readonly string[]).includes(value);
