import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import type { AuthContext, AuthenticatedRequest, SessionResolver, SystemContext, SystemResolver } from '../auth/auth-context';
import { AuthGuard } from '../auth/auth.guard';
import { AllowWhilePasswordPending, Authenticated, Public, RequirePermission, RequireScope } from '../auth/decorators';
import { PermissionsGuard } from '../auth/permissions.guard';
import { SESSION_COOKIE } from '../auth/session-cookie';
import { ApiError } from '../errors/api-error';

const docenteAuth: AuthContext = {
  sessionId: 1,
  userId: 10,
  principal: { userId: 10, assignments: [{ role: 'DOCENTE', estanciaId: 1 }] },
  activeEstanciaId: 1,
};

class Handlers {
  @Public()
  publicRoute(): void {}

  @Authenticated()
  privateRoute(): void {}

  forgottenRoute(): void {}

  @Authenticated()
  @AllowWhilePasswordPending()
  changePasswordRoute(): void {}

  @RequirePermission('USUARIO_ADMINISTRAR')
  adminRoute(): void {}

  @RequirePermission('ASISTENCIA_REGISTRAR')
  attendanceRoute(): void {}

  @RequireScope('REPORTE_AGREGADO_LEER')
  integrationRoute(): void {}
}

/** Contexto mínimo de Nest: handler real (para leer metadatos) y request. */
const contextFor = (handler: keyof Handlers, request: Partial<AuthenticatedRequest>): ExecutionContext =>
  ({
    getHandler: () => Handlers.prototype[handler],
    getClass: () => Handlers,
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

const resolver = (result: AuthContext | null): SessionResolver => ({ resolve: () => Promise.resolve(result) });

const systemContext: SystemContext = { systemId: 5, name: 'Tablero', scopes: ['REPORTE_AGREGADO_LEER'] };
const systemResolver = (result: SystemContext | null) => {
  const seen: string[] = [];
  const resolve: SystemResolver['resolve'] = (token) => {
    seen.push(token);
    return Promise.resolve(result);
  };
  return { seen, resolver: { resolve } };
};

describe('AuthGuard con sistemas externos (RF-37)', () => {
  const bearer = (token: string): Partial<AuthenticatedRequest> => ({ headers: { authorization: `Bearer ${token}` }, cookies: {} });

  it('una ruta de integración se autentica con el Bearer y adjunta el sistema, no una persona', async () => {
    const { resolver: systems, seen } = systemResolver(systemContext);
    const guard = new AuthGuard(new Reflector(), resolver(docenteAuth), systems);
    const request = bearer('abc.def.ghi');
    await expect(guard.canActivate(contextFor('integrationRoute', request))).resolves.toBe(true);
    expect(request.system).toEqual(systemContext);
    expect(request.auth).toBeUndefined();
    expect(seen).toEqual(['abc.def.ghi']);
  });

  it('sin Bearer, con uno mal formado o que no resuelve, responde NO_AUTENTICADO', async () => {
    const guard = new AuthGuard(new Reflector(), resolver(docenteAuth), systemResolver(null).resolver);
    for (const request of [{ headers: {}, cookies: {} }, { headers: { authorization: 'Basic abc' }, cookies: {} }, { headers: { authorization: 'Bearer ' }, cookies: {} }, bearer('malo')]) {
      await expect(guard.canActivate(contextFor('integrationRoute', request))).rejects.toMatchObject({ code: 'NO_AUTENTICADO' });
    }
  });

  it('la cookie de una persona no abre una ruta de integración', async () => {
    const guard = new AuthGuard(new Reflector(), resolver(docenteAuth), systemResolver(null).resolver);
    const request: Partial<AuthenticatedRequest> = { headers: {}, cookies: { [SESSION_COOKIE]: 'token' } };
    await expect(guard.canActivate(contextFor('integrationRoute', request))).rejects.toMatchObject({ code: 'NO_AUTENTICADO' });
  });

  it('un Bearer no abre las rutas de personas, y ni siquiera se consulta', async () => {
    const { resolver: systems, seen } = systemResolver(systemContext);
    const guard = new AuthGuard(new Reflector(), resolver(null), systems);
    await expect(guard.canActivate(contextFor('privateRoute', bearer('abc.def.ghi')))).rejects.toMatchObject({ code: 'NO_AUTENTICADO' });
    expect(seen).toEqual([]);
  });
});

describe('AuthGuard', () => {
  it('deja pasar rutas públicas sin cookie', async () => {
    const guard = new AuthGuard(new Reflector(), resolver(null), systemResolver(null).resolver);
    await expect(guard.canActivate(contextFor('publicRoute', {}))).resolves.toBe(true);
  });

  it('rechaza con NO_AUTENTICADO cuando no hay cookie', async () => {
    const guard = new AuthGuard(new Reflector(), resolver(docenteAuth), systemResolver(null).resolver);
    await expect(guard.canActivate(contextFor('privateRoute', { cookies: {} }))).rejects.toMatchObject({
      code: 'NO_AUTENTICADO',
    });
  });

  it('rechaza cuando el token no resuelve a una sesión', async () => {
    const guard = new AuthGuard(new Reflector(), resolver(null), systemResolver(null).resolver);
    const request = { cookies: { [SESSION_COOKIE]: 'token' } };
    await expect(guard.canActivate(contextFor('privateRoute', request))).rejects.toBeInstanceOf(ApiError);
  });

  it('adjunta el contexto de autenticación a la petición', async () => {
    const guard = new AuthGuard(new Reflector(), resolver(docenteAuth), systemResolver(null).resolver);
    const request: Partial<AuthenticatedRequest> = { cookies: { [SESSION_COOKIE]: 'token' } };
    await expect(guard.canActivate(contextFor('privateRoute', request))).resolves.toBe(true);
    expect(request.auth).toEqual(docenteAuth);
  });
});

describe('PermissionsGuard', () => {
  const guard = new PermissionsGuard(new Reflector());

  it('deja pasar rutas marcadas @Authenticated sin permiso concreto', () => {
    expect(guard.canActivate(contextFor('privateRoute', { auth: docenteAuth }))).toBe(true);
  });

  it('niega (cerrado por defecto) una ruta sin ninguna marca aunque haya sesión', () => {
    expect(() => guard.canActivate(contextFor('forgottenRoute', { auth: docenteAuth }))).toThrow(
      expect.objectContaining({ code: 'SIN_PERMISO' }),
    );
  });

  it('concede cuando el rol tiene el permiso en la estancia activa', () => {
    expect(guard.canActivate(contextFor('attendanceRoute', { auth: docenteAuth }))).toBe(true);
  });

  it('rechaza con SIN_PERMISO cuando el rol no tiene el permiso', () => {
    expect(() => guard.canActivate(contextFor('adminRoute', { auth: docenteAuth }))).toThrow(
      expect.objectContaining({ code: 'SIN_PERMISO' }),
    );
  });

  it('rechaza cuando la estancia activa no es la asignada', () => {
    const otherEstancia = { ...docenteAuth, activeEstanciaId: 2 };
    expect(() => guard.canActivate(contextFor('attendanceRoute', { auth: otherEstancia }))).toThrow(ApiError);
  });

  describe('sistemas externos (RF-37)', () => {
    it('concede cuando el sistema tiene el alcance que la ruta declara', () => {
      expect(guard.canActivate(contextFor('integrationRoute', { system: systemContext }))).toBe(true);
    });

    it('niega con SIN_PERMISO si le falta el alcance', () => {
      expect(() => guard.canActivate(contextFor('integrationRoute', { system: { ...systemContext, scopes: [] } }))).toThrow(expect.objectContaining({ code: 'SIN_PERMISO' }));
    });

    it('sin sistema en la petición responde NO_AUTENTICADO, aunque haya una persona con sesión', () => {
      expect(() => guard.canActivate(contextFor('integrationRoute', { auth: docenteAuth }))).toThrow(expect.objectContaining({ code: 'NO_AUTENTICADO' }));
    });

    it('un sistema no usa las rutas de personas: ni las de permiso ni las @Authenticated', () => {
      for (const route of ['attendanceRoute', 'privateRoute', 'adminRoute'] as const) {
        expect(() => guard.canActivate(contextFor(route, { system: systemContext }))).toThrow(expect.objectContaining({ code: 'NO_AUTENTICADO' }));
      }
    });
  });

  describe('contraseña temporal sin cambiar (RF-38)', () => {
    const pending = { ...docenteAuth, mustChangePassword: true };

    it('solo deja pasar lo marcado @AllowWhilePasswordPending', () => {
      expect(guard.canActivate(contextFor('changePasswordRoute', { auth: pending }))).toBe(true);
    });

    it('niega con CAMBIO_CONTRASENA_REQUERIDO el resto, incluso rutas @Authenticated y las que el rol sí permite', () => {
      for (const route of ['privateRoute', 'attendanceRoute'] as const) {
        expect(() => guard.canActivate(contextFor(route, { auth: pending }))).toThrow(expect.objectContaining({ code: 'CAMBIO_CONTRASENA_REQUERIDO' }));
      }
    });

    it('una sesión normal no se ve afectada', () => {
      expect(guard.canActivate(contextFor('privateRoute', { auth: { ...docenteAuth, mustChangePassword: false } }))).toBe(true);
    });
  });

  it('rechaza con NO_AUTENTICADO si no hay contexto (guard mal ordenado)', () => {
    expect(() => guard.canActivate(contextFor('adminRoute', {}))).toThrow(
      expect.objectContaining({ code: 'NO_AUTENTICADO' }),
    );
  });
});

describe('todos los controladores declaran su autorización', () => {
  it('cada manejador HTTP lleva @Public, @Authenticated o @RequirePermission', async () => {
    const { AuthController } = await import('../../modules/identity/controllers/auth.controller');
    const { UsersController } = await import('../../modules/identity/controllers/users.controller');
    const { HealthController } = await import('../../modules/health/health.controller');
    const reflector = new Reflector();
    for (const controller of [AuthController, UsersController, HealthController]) {
      const handlers = Object.getOwnPropertyNames(controller.prototype).filter(
        (name) => name !== 'constructor' && typeof Reflect.getMetadata('path', controller.prototype[name as never]) === 'string',
      );
      expect(handlers.length).toBeGreaterThan(0);
      for (const name of handlers) {
        const targets = [controller.prototype[name as never], controller];
        const marked =
          reflector.getAllAndOverride<boolean>('sirai:public', targets) ||
          reflector.getAllAndOverride<boolean>('sirai:authenticated', targets) ||
          reflector.getAllAndOverride<string>('sirai:permission', targets);
        expect(marked, `${controller.name}.${name} sin marca`).toBeTruthy();
      }
    }
  });
});
