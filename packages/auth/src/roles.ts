/**
 * Códigos de rol. Coinciden con la semilla de la tabla `roles` del esquema
 * del equipo (docs/architecture/data-model.md). Cambiarlos exige migración.
 */
export const ROLE_CODES = [
  'DIRECTORA',
  'DOCENTE',
  'TRABAJO_SOCIAL',
  'ENFERMERIA',
  'MEDICO',
  'SUPERVISOR_CENTRAL',
  'ADMIN_CENTRAL',
] as const;

export type RoleCode = (typeof ROLE_CODES)[number];

/** Roles cuyo alcance es todo el sistema; se asignan con `estanciaId: null`. */
export const CENTRAL_ROLE_CODES: readonly RoleCode[] = ['SUPERVISOR_CENTRAL', 'ADMIN_CENTRAL'];

export const isRoleCode = (value: unknown): value is RoleCode =>
  typeof value === 'string' && (ROLE_CODES as readonly string[]).includes(value);
