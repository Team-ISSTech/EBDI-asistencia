import type { PermissionCode } from '@sirai/auth';
import type { ReactNode } from 'react';
import { Navigate } from 'react-router';
import { useSession } from './use-session';

export interface RequirePermissionProps {
  readonly permission: PermissionCode;
  readonly children: ReactNode;
}

/**
 * Oculta lo que la sesión no puede usar. Es comodidad para la persona, no
 * seguridad: la API vuelve a comprobar cada permiso.
 */
export function RequirePermission({ permission, children }: RequirePermissionProps) {
  const { data: session } = useSession();
  if (!session) return null;
  if (!session.permissions.includes(permission)) return <Navigate to="/app/sin-permiso" replace />;
  return children;
}
