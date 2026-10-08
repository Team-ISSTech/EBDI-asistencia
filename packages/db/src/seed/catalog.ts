import { ROLE_PERMISSIONS, type PermissionCode, type RoleCode } from '@sirai/auth';
import { and, eq } from 'drizzle-orm';
import type { Db } from '../client.js';
import { permisos, rolPermiso, roles } from '../schema/index.js';

export interface RolePermissionPair {
  readonly role: RoleCode;
  readonly permission: PermissionCode;
}

/** Pares (rol, permiso) que dicta la matriz de `@sirai/auth`. */
export function expectedRolePermissionPairs(): RolePermissionPair[] {
  return (Object.entries(ROLE_PERMISSIONS) as [RoleCode, readonly PermissionCode[]][]).flatMap(
    ([role, permissions]) => permissions.map((permission) => ({ role, permission })),
  );
}

const codeToId = async (db: Db, table: typeof roles | typeof permisos): Promise<Map<string, number>> => {
  const rows = await db.select({ id: table.id, code: table.code }).from(table);
  return new Map(rows.map((row) => [row.code, row.id]));
};

const pairKey = (roleId: number, permissionId: number): string => `${roleId}:${permissionId}`;

/**
 * Sincroniza `rol_permiso` con la matriz en código: inserta los pares que
 * faltan y elimina los que sobran. Es una tabla de catálogo, no un registro
 * sensible, por eso aquí sí se permite DELETE.
 */
export async function syncRolePermissions(db: Db): Promise<{ inserted: number; removed: number }> {
  const roleIds = await codeToId(db, roles);
  const permissionIds = await codeToId(db, permisos);
  const wanted = new Map(
    expectedRolePermissionPairs().map(({ role, permission }) => {
      const roleId = roleIds.get(role);
      const permissionId = permissionIds.get(permission);
      if (roleId === undefined || permissionId === undefined) {
        throw new Error(`Catálogo incompleto: falta ${role} o ${permission} en la base.`);
      }
      return [pairKey(roleId, permissionId), { roleId, permissionId }];
    }),
  );
  const existing = await db.select().from(rolPermiso);
  const existingKeys = new Set(existing.map((row) => pairKey(row.roleId, row.permissionId)));

  const toInsert = [...wanted.values()].filter(
    ({ roleId, permissionId }) => !existingKeys.has(pairKey(roleId, permissionId)),
  );
  const toRemove = existing.filter((row) => !wanted.has(pairKey(row.roleId, row.permissionId)));

  if (toInsert.length > 0) await db.insert(rolPermiso).values(toInsert);
  for (const row of toRemove) {
    await db
      .delete(rolPermiso)
      .where(and(eq(rolPermiso.roleId, row.roleId), eq(rolPermiso.permissionId, row.permissionId)));
  }
  return { inserted: toInsert.length, removed: toRemove.length };
}
