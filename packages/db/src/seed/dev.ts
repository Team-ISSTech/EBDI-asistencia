import { ROLE_CODES, CENTRAL_ROLE_CODES, type RoleCode } from '@sirai/auth';
import argon2 from 'argon2';
import { and, eq, isNull } from 'drizzle-orm';
import type { Db } from '../client.js';
import { ciclosEscolares, estancias, rooms, roles, usuarioRol, usuarios } from '../schema/index.js';

/**
 * Datos ficticios de desarrollo. No hay infantes ni tutores: el SRS prohíbe
 * datos reales de menores y la semilla no necesita ninguno.
 */
export const DEV_ESTANCIAS = [
  { ebdiCode: 'EBDI-TEST-01', name: 'Estancia de prueba 01', region: 'Prueba' },
  { ebdiCode: 'EBDI-TEST-02', name: 'Estancia de prueba 02', region: 'Prueba' },
] as const;

export const DEV_SCHOOL_YEAR = { code: '2026-2027', startDate: '2026-08-24', endDate: '2027-07-16' } as const;

export const DEV_ROOMS = [
  { name: 'Lactantes (prueba)', shift: 'MATUTINO', minAgeMonths: 0, maxAgeMonths: 18, capacity: 12 },
  { name: 'Maternal (prueba)', shift: 'MATUTINO', minAgeMonths: 19, maxAgeMonths: 48, capacity: 20 },
] as const;

export const DEV_USER_EMAIL_DOMAIN = 'sirai.test';
const MIN_SEED_PASSWORD_LENGTH = 10;

/**
 * Los usuarios ficticios comparten una contraseña conocida: la semilla se
 * niega en producción y exige una contraseña mínima. Se llama antes de tocar
 * la base.
 */
export function assertSeedAllowed(env: Readonly<Record<string, string | undefined>>, seedPassword: string): void {
  if (env['NODE_ENV'] === 'production') {
    throw new Error('La semilla de desarrollo no se ejecuta con NODE_ENV=production.');
  }
  if (seedPassword.length < MIN_SEED_PASSWORD_LENGTH) {
    throw new Error(`SEED_PASSWORD debe tener al menos ${MIN_SEED_PASSWORD_LENGTH} caracteres.`);
  }
}

export const devUserEmail = (role: RoleCode): string =>
  `${role.toLowerCase()}@${DEV_USER_EMAIL_DOMAIN}`;

const upsertEstancias = async (db: Db): Promise<number[]> => {
  const now = new Date();
  for (const estancia of DEV_ESTANCIAS) {
    await db
      .insert(estancias)
      .values({ ...estancia, createdAt: now, updatedAt: now })
      .onDuplicateKeyUpdate({ set: { name: estancia.name, updatedAt: now } });
  }
  const rows = await db.select({ id: estancias.id, code: estancias.ebdiCode }).from(estancias);
  return DEV_ESTANCIAS.map(({ ebdiCode }) => {
    const found = rows.find((row) => row.code === ebdiCode);
    if (!found) throw new Error(`No se pudo leer la estancia ${ebdiCode}.`);
    return found.id;
  });
};

const upsertUser = async (db: Db, role: RoleCode, passwordHash: string, estanciaId: number): Promise<number> => {
  const now = new Date();
  const email = devUserEmail(role);
  await db
    .insert(usuarios)
    .values({
      name: `Usuario ${role}`,
      email,
      passwordHash,
      defaultEstanciaId: estanciaId,
      createdAt: now,
      updatedAt: now,
    })
    .onDuplicateKeyUpdate({ set: { passwordHash, updatedAt: now } });
  const [row] = await db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, email));
  if (!row) throw new Error(`No se pudo leer el usuario ${email}.`);
  return row.id;
};

/**
 * La llave única (usuario, rol, estancia) no detecta duplicados cuando la
 * estancia es NULL (roles centrales), porque MySQL trata cada NULL como
 * distinto. Por eso se busca antes de insertar.
 */
const ensureAssignment = async (db: Db, userId: number, role: RoleCode, estanciaId: number | null): Promise<void> => {
  const [roleRow] = await db.select({ id: roles.id }).from(roles).where(eq(roles.code, role));
  if (!roleRow) throw new Error(`Falta el rol ${role} en la base.`);
  const scopeCondition = estanciaId === null ? isNull(usuarioRol.estanciaId) : eq(usuarioRol.estanciaId, estanciaId);
  const existing = await db
    .select({ id: usuarioRol.id })
    .from(usuarioRol)
    .where(and(eq(usuarioRol.userId, userId), eq(usuarioRol.roleId, roleRow.id), scopeCondition));
  if (existing.length > 0) return;
  await db.insert(usuarioRol).values({ userId, roleId: roleRow.id, estanciaId, validFrom: new Date() });
};

const seedSchoolYearAndRooms = async (db: Db, estanciaId: number): Promise<void> => {
  const now = new Date();
  await db
    .insert(ciclosEscolares)
    .values({ ...DEV_SCHOOL_YEAR, createdAt: now })
    .onDuplicateKeyUpdate({ set: { startDate: DEV_SCHOOL_YEAR.startDate } });
  for (const room of DEV_ROOMS) {
    await db
      .insert(rooms)
      .values({ ...room, estanciaId, createdAt: now, updatedAt: now })
      .onDuplicateKeyUpdate({ set: { capacity: room.capacity, updatedAt: now } });
  }
};

/**
 * Crea 2 estancias y un usuario por rol con la contraseña indicada. Es
 * repetible: al volver a correr actualiza la contraseña de los usuarios
 * ficticios (solo ellos, por correo `@sirai.test`) para que coincida con
 * SEED_PASSWORD.
 */
export async function seedDevelopmentData(db: Db, seedPassword: string, env = process.env): Promise<{ users: string[] }> {
  assertSeedAllowed(env, seedPassword);
  const [firstEstanciaId] = await upsertEstancias(db);
  if (firstEstanciaId === undefined) throw new Error('No se sembraron estancias.');
  await seedSchoolYearAndRooms(db, firstEstanciaId);
  const passwordHash = await argon2.hash(seedPassword, { type: argon2.argon2id });
  const users: string[] = [];
  for (const role of ROLE_CODES) {
    const userId = await upsertUser(db, role, passwordHash, firstEstanciaId);
    const scope = CENTRAL_ROLE_CODES.includes(role) ? null : firstEstanciaId;
    await ensureAssignment(db, userId, role, scope);
    users.push(devUserEmail(role));
  }
  return { users };
}
