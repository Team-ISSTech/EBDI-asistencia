import type { PermissionCode } from '@sirai/auth';

export interface NavItem {
  readonly path: string;
  readonly label: string;
  readonly permission: PermissionCode;
  /** Agrupa el menú por el trabajo que hace la persona, no por módulo técnico. */
  readonly group: 'Operación' | 'Seguimiento' | 'Dirección' | 'Administración';
}

/** Orden del menú = orden del día en una estancia: pase de lista primero. */
export const NAV_ITEMS: readonly NavItem[] = [
  { path: '/app/pase-de-lista', label: 'Pase de lista', permission: 'ASISTENCIA_CONSULTAR', group: 'Operación' },
  { path: '/app/infantes', label: 'Infantes', permission: 'INFANTE_CONSULTAR', group: 'Operación' },
  { path: '/app/seguimientos', label: 'Seguimientos', permission: 'SEGUIMIENTO_CONSULTAR', group: 'Seguimiento' },
  { path: '/app/reportes', label: 'Reportes', permission: 'REPORTE_AGREGADO_CONSULTAR', group: 'Dirección' },
  { path: '/app/administracion/usuarios', label: 'Usuarios', permission: 'USUARIO_ADMINISTRAR', group: 'Administración' },
  { path: '/app/administracion/estancias', label: 'Estancias', permission: 'ESTANCIA_ADMINISTRAR', group: 'Administración' },
  { path: '/app/administracion/salas', label: 'Salas', permission: 'SALA_ADMINISTRAR', group: 'Administración' },
  { path: '/app/auditoria', label: 'Auditoría', permission: 'AUDITORIA_CONSULTAR', group: 'Administración' },
];

/** Entradas visibles para un conjunto de permisos, conservando el orden. */
export const visibleNavItems = (permissions: readonly PermissionCode[]): NavItem[] =>
  NAV_ITEMS.filter((item) => permissions.includes(item.permission));

/** Primera pantalla útil para la sesión; `null` si no tiene ninguna. */
export const landingPathFor = (permissions: readonly PermissionCode[]): string | null =>
  visibleNavItems(permissions)[0]?.path ?? null;
