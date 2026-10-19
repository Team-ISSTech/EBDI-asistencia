import { randomInt } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '../client.js';
import { auditoria, roles, usuarioRol, usuarios } from '../schema/index.js';
import { DEV_USER_EMAIL_DOMAIN } from './dev.js';

/** Sin 0/O, 1/l/I: la contraseña temporal se teclea a mano desde un papel o un mensaje. */
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
const PASSWORD_LENGTH = 20;
const ADMIN_ROLE = 'ADMIN_CENTRAL';
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function generateTemporaryPassword(): string {
  return Array.from({ length: PASSWORD_LENGTH }, () => PASSWORD_ALPHABET[randomInt(PASSWORD_ALPHABET.length)]).join('');
}

export function assertAdminInput(input: { readonly email: string; readonly name: string }): void {
  if (!EMAIL_PATTERN.test(input.email)) throw new Error('El correo del administrador no es válido.');
  if (input.name.trim() === '') throw new Error('El nombre del administrador no puede estar vacío.');
  if (input.email.toLowerCase().endsWith(`@${DEV_USER_EMAIL_DOMAIN}`)) {
    throw new Error(`Los correos @${DEV_USER_EMAIL_DOMAIN} son de la semilla de desarrollo; usa el correo institucional real.`);
  }
}

export interface BootstrapAdminInput {
  readonly email: string;
  readonly name: string;
  readonly passwordHash: string;
  readonly passwordExpiresAt: Date;
  readonly now: Date;
}

/**
 * Crea el primer Administrador Central de un despliegue nuevo, donde la semilla de desarrollo no corre. La
 * contraseña es temporal: debe cambiarse al entrar. Solo funciona mientras no exista un administrador, para que
 * no sea una puerta trasera; los siguientes usuarios los crea ese administrador desde la aplicación.
 */
export async function bootstrapAdmin(db: Db, input: BootstrapAdminInput): Promise<{ userId: number }> {
  assertAdminInput(input);
  return db.transaction(async (tx) => {
    const [role] = await tx.select({ id: roles.id }).from(roles).where(eq(roles.code, ADMIN_ROLE));
    if (!role) throw new Error(`Falta el rol ${ADMIN_ROLE}: aplica primero las migraciones.`);
    const existing = await tx
      .select({ id: usuarioRol.id })
      .from(usuarioRol)
      .innerJoin(usuarios, eq(usuarios.id, usuarioRol.userId))
      .where(and(eq(usuarioRol.roleId, role.id), isNull(usuarios.deletedAt)));
    if (existing.length > 0) throw new Error('Ya existe un administrador central; este comando solo crea el primero.');
    const [created] = await tx.insert(usuarios).values({
      name: input.name.trim(),
      email: input.email,
      passwordHash: input.passwordHash,
      mustChangePassword: true,
      temporaryPasswordExpiresAt: input.passwordExpiresAt,
      createdAt: input.now,
      updatedAt: input.now,
    });
    await tx.insert(usuarioRol).values({ userId: created.insertId, roleId: role.id, estanciaId: null, validFrom: input.now });
    await tx.insert(auditoria).values({
      userId: null,
      roleCode: 'SISTEMA',
      action: 'USUARIO_CREADO',
      tableName: 'usuarios',
      recordId: String(created.insertId),
      userAgent: 'cli:crear-admin',
      occurredAt: input.now,
    });
    return { userId: created.insertId };
  });
}
