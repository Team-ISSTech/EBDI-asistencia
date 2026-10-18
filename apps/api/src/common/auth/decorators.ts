import { createParamDecorator, type ExecutionContext, SetMetadata } from '@nestjs/common';
import type { IntegrationScope, PermissionCode } from '@sirai/auth';
import type { AuthContext, AuthenticatedRequest, SystemContext } from './auth-context';

export const IS_PUBLIC = 'sirai:public';
export const IS_AUTHENTICATED = 'sirai:authenticated';
export const REQUIRED_PERMISSION = 'sirai:permission';
export const ALLOWS_PASSWORD_PENDING = 'sirai:password-pending';
export const REQUIRED_SCOPE = 'sirai:scope';

/**
 * Toda ruta debe declarar exactamente una de estas tres marcas; sin marca,
 * `PermissionsGuard` niega el acceso (cerrado por defecto).
 */

/** Ruta sin sesión (login, health). */
export const Public = (): MethodDecorator & ClassDecorator => SetMetadata(IS_PUBLIC, true);

/** Ruta que solo exige sesión válida, sin permiso concreto (perfil, logout). */
export const Authenticated = (): MethodDecorator & ClassDecorator => SetMetadata(IS_AUTHENTICATED, true);

/** Exige un permiso en la estancia activa; lo evalúa `PermissionsGuard`. */
export const RequirePermission = (permission: PermissionCode): MethodDecorator & ClassDecorator =>
  SetMetadata(REQUIRED_PERMISSION, permission);

/**
 * Ruta para sistemas externos (RF-37): se autentica con `Authorization: Bearer`
 * y exige un alcance. Las personas (cookie) no entran por aquí ni los sistemas
 * por las rutas de personas: son dos mundos separados.
 */
export const RequireScope = (scope: IntegrationScope): MethodDecorator & ClassDecorator => SetMetadata(REQUIRED_SCOPE, scope);

/**
 * Ruta que una sesión con contraseña temporal sin cambiar sí puede usar: ver
 * quién es, cambiar la contraseña y cerrar sesión. Todo lo demás se niega.
 */
export const AllowWhilePasswordPending = (): MethodDecorator & ClassDecorator => SetMetadata(ALLOWS_PASSWORD_PENDING, true);

/** Inyecta el `AuthContext` de la petición en un parámetro del controlador. */
export const CurrentAuth = createParamDecorator((_data: unknown, context: ExecutionContext): AuthContext => {
  const auth = context.switchToHttp().getRequest<AuthenticatedRequest>().auth;
  if (!auth) throw new Error('CurrentAuth usado en una ruta sin AuthGuard.');
  return auth;
});

/** Inyecta el `SystemContext` en una ruta de integración. */
export const CurrentSystem = createParamDecorator((_data: unknown, context: ExecutionContext): SystemContext => {
  const system = context.switchToHttp().getRequest<AuthenticatedRequest>().system;
  if (!system) throw new Error('CurrentSystem usado en una ruta sin RequireScope.');
  return system;
});
