import argon2 from 'argon2';
import { connect } from '../client.js';
import { syncRolePermissions } from '../seed/catalog.js';
import { bootstrapAdmin, generateTemporaryPassword } from '../seed/bootstrap-admin.js';
import { loadRootEnv, requireEnv } from './env.js';

const MS_PER_DAY = 86_400_000;
const DEFAULT_TEMP_DAYS = 7;

/**
 * Crea el primer Administrador Central: `ADMIN_EMAIL` y `ADMIN_NAME` son obligatorias; `ADMIN_PASSWORD` es opcional (si falta, se
 * genera una y se muestra una sola vez). La contraseña es temporal y caduca en `TEMP_PASSWORD_DAYS` días.
 */
loadRootEnv();
const email = requireEnv('ADMIN_EMAIL');
const name = requireEnv('ADMIN_NAME');
const password = process.env['ADMIN_PASSWORD'] || generateTemporaryPassword();
const days = Number(process.env['TEMP_PASSWORD_DAYS'] ?? DEFAULT_TEMP_DAYS);
const now = new Date();
const connection = connect(requireEnv('DATABASE_URL'));
try {
  await syncRolePermissions(connection.db);
  const { userId } = await bootstrapAdmin(connection.db, {
    email,
    name,
    passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
    passwordExpiresAt: new Date(now.getTime() + days * MS_PER_DAY),
    now,
  });
  process.stdout.write(`Administrador central creado (id ${userId}): ${email}\n`);
  if (!process.env['ADMIN_PASSWORD']) process.stdout.write(`Contraseña temporal (se muestra solo ahora; debe cambiarse al entrar y caduca en ${days} días): ${password}\n`);
} finally {
  await connection.close();
}
