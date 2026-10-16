import type { PermissionCode } from './permissions.js';
import type { RoleCode } from './roles.js';

/**
 * Matriz rol → permisos. Es la fuente de verdad del sistema: la tabla
 * `rol_permiso` se siembra desde aquí (packages/db) y los guards de la API
 * consultan esta matriz, no la base de datos.
 *
 * Derivada de la tabla de permisos del SRS (RF-06..RF-11). Los permisos de
 * Trabajo Social se reutilizan en Enfermería, Médico y Directora porque el SRS
 * los define como "igual que Trabajo Social, más…".
 *
 * Padrón de infantes: lo consulta todo el personal de estancia; solo la
 * Directora lo administra y registra consentimientos. Los roles centrales no
 * ven datos de infantes (RF-10, RF-18).
 */
const SOCIAL_WORK_PERMISSIONS: readonly PermissionCode[] = [
  'ASISTENCIA_CONSULTAR',
  'INFANTE_CONSULTAR',
  'SEGUIMIENTO_CONSULTAR',
  'SEGUIMIENTO_REGISTRAR',
  'NOTA_SENSIBLE_CONSULTAR',
];

const TEACHER_PERMISSIONS: readonly PermissionCode[] = [
  'ASISTENCIA_CONSULTAR',
  'ASISTENCIA_REGISTRAR',
  'INFANTE_CONSULTAR',
];

const unique = (codes: readonly PermissionCode[]): readonly PermissionCode[] => [
  ...new Set(codes),
];

export const ROLE_PERMISSIONS: Readonly<Record<RoleCode, readonly PermissionCode[]>> = {
  DOCENTE: TEACHER_PERMISSIONS,
  TRABAJO_SOCIAL: SOCIAL_WORK_PERMISSIONS,
  ENFERMERIA: SOCIAL_WORK_PERMISSIONS,
  MEDICO: unique([...SOCIAL_WORK_PERMISSIONS, 'ALTA_MEDICA_REGISTRAR']),
  DIRECTORA: unique([
    ...TEACHER_PERMISSIONS,
    ...SOCIAL_WORK_PERMISSIONS,
    'JORNADA_CERRAR',
    'INFANTE_ADMINISTRAR',
    'CONSENTIMIENTO_REGISTRAR',
    'EXPEDIENTE_EXPORTAR',
    'REPORTE_AGREGADO_CONSULTAR',
  ]),
  SUPERVISOR_CENTRAL: ['REPORTE_AGREGADO_CONSULTAR'],
  ADMIN_CENTRAL: ['USUARIO_ADMINISTRAR', 'AUDITORIA_CONSULTAR', 'REPORTE_AGREGADO_CONSULTAR'],
};
