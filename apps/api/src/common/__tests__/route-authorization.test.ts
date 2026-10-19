import 'reflect-metadata';
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { RequestMethod } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { ALL_CONTROLLERS } from './route-controllers';
import { IS_AUTHENTICATED, IS_PUBLIC, REQUIRED_PERMISSION, REQUIRED_SCOPE } from '../auth/decorators';

type Controller = new (...args: never[]) => object;
interface RouteInfo {
  readonly route: string;
  readonly marks: readonly string[];
}

const MARKS = [IS_PUBLIC, IS_AUTHENTICATED, REQUIRED_PERMISSION, REQUIRED_SCOPE] as const;
const MARK_NAMES: Readonly<Record<string, string>> = {
  [IS_PUBLIC]: 'público',
  [IS_AUTHENTICATED]: 'autenticado',
  [REQUIRED_PERMISSION]: 'permiso',
  [REQUIRED_SCOPE]: 'alcance',
};

const controllers: readonly Controller[] = ALL_CONTROLLERS;
const MODULES_DIR = resolve(__dirname, '../../modules');

const joinPath = (...parts: readonly string[]): string => `/${parts.map((part) => part.replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/')}`;

/** Marca efectiva de una ruta: la del método y, si no tiene, la de la clase (igual que los guards). */
const marksOf = (controller: Controller, handler: object): string[] => {
  const onMethod = MARKS.filter((key) => Reflect.getMetadata(key, handler) !== undefined);
  return (onMethod.length > 0 ? onMethod : MARKS.filter((key) => Reflect.getMetadata(key, controller) !== undefined)).map((key) => MARK_NAMES[key] ?? key);
};

const routesOf = (controller: Controller): RouteInfo[] => {
  const base = (Reflect.getMetadata(PATH_METADATA, controller) as string | undefined) ?? '';
  return Object.getOwnPropertyNames(controller.prototype)
    .filter((name) => name !== 'constructor')
    .map((name) => (controller.prototype as Record<string, object>)[name])
    .filter((handler): handler is object => typeof handler === 'function' && Reflect.getMetadata(PATH_METADATA, handler) !== undefined)
    .map((handler) => {
      const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, handler) as number] ?? '?';
      return { route: `${method} ${joinPath(base, Reflect.getMetadata(PATH_METADATA, handler) as string)}`, marks: marksOf(controller, handler) };
    });
};

const routes = controllers.flatMap(routesOf);

/** RNF-06: la autorización vive en el backend y ninguna ruta puede quedar sin declararla. */
describe('autorización declarada en cada ruta', () => {
  it('encuentra las rutas de la API (si no, esta prueba no vigila nada)', () => {
    expect(routes.length).toBeGreaterThanOrEqual(60);
  });

  it('la lista de controladores de esta prueba incluye todos los que hay en el código', () => {
    const files = (readdirSync(MODULES_DIR, { recursive: true }) as string[]).filter((file) => file.endsWith('.controller.ts'));
    const declared = files.reduce((total, file) => total + (readFileSync(join(MODULES_DIR, file), 'utf8').match(/^@Controller\(/gm) ?? []).length, 0);
    expect(controllers).toHaveLength(declared);
  });

  it('cada ruta declara exactamente una marca: público, autenticado, permiso o alcance', () => {
    const wrong = routes.filter((info) => info.marks.length !== 1).map((info) => `${info.route}: ${info.marks.join('+') || 'sin marca'}`);
    expect(wrong).toEqual([]);
  });

  it('las únicas rutas públicas son el login, el canje de token de un sistema y el estado de salud', () => {
    const publicRoutes = routes.filter((info) => info.marks.includes('público')).map((info) => info.route).sort();
    expect(publicRoutes).toEqual(['GET /health', 'POST /auth/login', 'POST /integracion/token']);
  });

  it('las rutas de alcance (Bearer de un sistema) viven solo bajo /integracion', () => {
    const outside = routes.filter((info) => info.marks.includes('alcance') && !info.route.includes(' /integracion/')).map((info) => info.route);
    expect(outside).toEqual([]);
  });

  it('las rutas que solo exigen sesión son el perfil, la sesión y la sincronización', () => {
    const authenticated = routes.filter((info) => info.marks.includes('autenticado')).map((info) => info.route).sort();
    expect(authenticated).toEqual(['GET /auth/me', 'POST /auth/contrasena', 'POST /auth/estancia', 'POST /auth/logout', 'POST /sincronizacion']);
  });
});
