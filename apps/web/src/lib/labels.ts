import type { RoleCode } from '@sirai/auth';
import type { UserStatus } from '@sirai/contracts';

/** Nombres para personas; los códigos son para programas. */
export const ROLE_LABELS: Readonly<Record<RoleCode, string>> = {
  DIRECTORA: 'Directora de estancia',
  DOCENTE: 'Docente',
  TRABAJO_SOCIAL: 'Trabajo social',
  ENFERMERIA: 'Enfermería',
  MEDICO: 'Médico de estancia',
  SUPERVISOR_CENTRAL: 'Supervisor central',
  ADMIN_CENTRAL: 'Administrador central',
};

export const STATUS_LABELS: Readonly<Record<UserStatus, string>> = {
  ACTIVO: 'Activo',
  INACTIVO: 'Inactivo',
};
