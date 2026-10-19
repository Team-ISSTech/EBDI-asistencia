import { resolve } from 'node:path';
import argon2 from 'argon2';
import { applyMigrations, connect, dropAllObjects, schema, seedDevelopmentData, syncRolePermissions, type Db } from '@sirai/db';
import { eq } from 'drizzle-orm';
import { LOAD_DOMAIN, LOAD_PASSWORD, loadEmail, loadEnrollmentNumber, pad } from './naming';

/**
 * Carga sintética para la prueba de carga (RNF-08): 212 estancias con sus tres cuentas operativas,
 * infantes inventados con una jornada pasada ya cerrada y los seguimientos de sus faltas.
 * Vacía la base: solo corre contra una base que termina en `_test`. Nunca datos reales.
 */
const { estancias, rooms, usuarios, usuarioRol, roles, children, enrollments, jornadasAsistencia, attendanceRecords, followUps, ciclosEscolares } = schema;

const ESTANCIAS = Number(process.env['LOAD_ESTANCIAS'] ?? 212);
const CHILDREN_PER_ESTANCIA = Number(process.env['LOAD_CHILDREN'] ?? 40);
const ABSENT_PER_ESTANCIA = 3;
const ROOM_CAPACITY = 20;
const CHUNK = 1000;
const MS_PER_DAY = 86_400_000;
const SQL_DIR = resolve(__dirname, '../../../packages/db/sql');
const OPERATIVE_ROLES = ['DIRECTORA', 'DOCENTE', 'TRABAJO_SOCIAL'] as const;

const chunks = <T>(items: readonly T[]): T[][] => Array.from({ length: Math.ceil(items.length / CHUNK) }, (_, index) => items.slice(index * CHUNK, (index + 1) * CHUNK));

const must = <T>(value: T | undefined, what: string): T => {
  if (value === undefined) throw new Error(`No se encontró ${what}.`);
  return value;
};
const requireOne = <T>(rows: readonly T[], what: string): T => must(rows[0], what);

async function seedEstanciasAndRooms(db: Db, now: Date): Promise<Map<number, number[]>> {
  const values = Array.from({ length: ESTANCIAS }, (_, index) => ({ ebdiCode: `LOAD-${pad(index + 1)}`, name: `Estancia de carga ${pad(index + 1)}`, region: `Región ${(index % 8) + 1}`, createdAt: now, updatedAt: now }));
  for (const part of chunks(values)) await db.insert(estancias).values(part);
  const rows = await db.select({ id: estancias.id, code: estancias.ebdiCode }).from(estancias);
  const ids = new Map(rows.map((row) => [row.code, row.id]));
  const roomValues = values.flatMap((estancia) => ['A', 'B'].map((letter) => ({ estanciaId: must(ids.get(estancia.ebdiCode), 'estancia'), name: `Maternal ${letter}`, shift: 'MATUTINO', minAgeMonths: 19, maxAgeMonths: 48, capacity: ROOM_CAPACITY, createdAt: now, updatedAt: now })));
  for (const part of chunks(roomValues)) await db.insert(rooms).values(part);
  const roomRows = await db.select({ id: rooms.id, estanciaId: rooms.estanciaId }).from(rooms);
  const byEstancia = new Map<number, number[]>();
  for (const room of roomRows) byEstancia.set(room.estanciaId, [...(byEstancia.get(room.estanciaId) ?? []), room.id]);
  return byEstancia;
}

async function seedUsers(db: Db, now: Date, estanciaIds: readonly number[]): Promise<Map<string, number>> {
  const passwordHash = await argon2.hash(LOAD_PASSWORD, { type: argon2.argon2id });
  const roleIds = new Map((await db.select({ id: roles.id, code: roles.code }).from(roles)).map((role) => [role.code, role.id]));
  const accounts = estanciaIds.flatMap((estanciaId, index) => OPERATIVE_ROLES.map((role) => ({ estanciaId, role, email: loadEmail(role, index + 1) })));
  for (const part of chunks(accounts)) {
    await db.insert(usuarios).values(part.map((account) => ({ name: account.email, email: account.email, passwordHash, defaultEstanciaId: account.estanciaId, createdAt: now, updatedAt: now })));
  }
  const userRows = await db.select({ id: usuarios.id, email: usuarios.email }).from(usuarios);
  const userIds = new Map(userRows.map((row) => [row.email, row.id]));
  const assignments = accounts.map((account) => ({ userId: must(userIds.get(account.email), 'usuario'), roleId: must(roleIds.get(account.role), 'rol'), estanciaId: account.estanciaId, validFrom: now }));
  for (const part of chunks(assignments)) await db.insert(usuarioRol).values(part);
  return userIds;
}

async function seedChildren(db: Db, now: Date, estanciaIds: readonly number[], roomsByEstancia: Map<number, number[]>, schoolYearId: number): Promise<Map<number, number[]>> {
  const birthDate = new Date(now.getTime() - 730 * MS_PER_DAY).toISOString().slice(0, 10);
  const startDate = new Date(now.getTime() - 60 * MS_PER_DAY).toISOString().slice(0, 10);
  const people = estanciaIds.flatMap((estanciaId, index) => Array.from({ length: CHILDREN_PER_ESTANCIA }, (_, child) => ({ estanciaId, number: loadEnrollmentNumber(index + 1, child + 1), name: `Infante ${pad(index + 1)}-${pad(child + 1)}`, slot: child })));
  for (const part of chunks(people)) await db.insert(children).values(part.map((person) => ({ enrollmentNumber: person.number, name: person.name, paternalSurname: 'Carga', birthDate, createdAt: now, updatedAt: now })));
  const childIds = new Map((await db.select({ id: children.id, number: children.enrollmentNumber }).from(children)).map((row) => [row.number, row.id]));
  const rows = people.map((person) => {
    const roomIds = roomsByEstancia.get(person.estanciaId) ?? [];
    return { childId: must(childIds.get(person.number), 'infante'), estanciaId: person.estanciaId, roomId: must(roomIds[person.slot % roomIds.length], 'sala'), schoolYearId, startDate, createdAt: now, updatedAt: now };
  });
  for (const part of chunks(rows)) await db.insert(enrollments).values(part);
  const enrollmentRows = await db.select({ id: enrollments.id, estanciaId: enrollments.estanciaId }).from(enrollments);
  const byEstancia = new Map<number, number[]>();
  for (const row of enrollmentRows) byEstancia.set(row.estanciaId, [...(byEstancia.get(row.estanciaId) ?? []), row.id]);
  return byEstancia;
}

/** La jornada de hace dos días ya cerrada, con faltas y sus seguimientos abiertos: lo que hace falta para trabajar la bandeja. */
async function seedYesterday(db: Db, now: Date, estanciaIds: readonly number[], enrollmentsByEstancia: Map<number, number[]>, userIds: Map<string, number>, schoolYearId: number): Promise<void> {
  // Hace dos días en la fecha local de quien corre la prueba, para no chocar con la jornada de hoy (la que abre el ejecutor).
  const date = new Date(now.getTime() - 2 * MS_PER_DAY).toLocaleDateString('en-CA');
  const journeys = estanciaIds.map((estanciaId, index) => ({ estanciaId, schoolYearId, date, shift: 'MATUTINO', status: 'CERRADA', openedAt: now, closedAt: now, openedBy: must(userIds.get(loadEmail('DIRECTORA', index + 1)), 'directora'), closedBy: must(userIds.get(loadEmail('DIRECTORA', index + 1)), 'directora'), createdAt: now }));
  await db.insert(jornadasAsistencia).values(journeys);
  const journeyIds = new Map((await db.select({ id: jornadasAsistencia.id, estanciaId: jornadasAsistencia.estanciaId }).from(jornadasAsistencia)).map((row) => [row.estanciaId, row.id]));
  let counter = 0;
  const records = estanciaIds.flatMap((estanciaId, index) =>
    (enrollmentsByEstancia.get(estanciaId) ?? []).map((enrollmentId, position) => {
      counter += 1;
      const status = position < ABSENT_PER_ESTANCIA ? 'FALTA_INJUSTIFICADA' : 'PRESENTE';
      return { journeyId: must(journeyIds.get(estanciaId), 'jornada'), enrollmentId, status, clientId: `00000000-0000-4000-8000-${counter.toString(16).padStart(12, '0')}`, recordedBy: must(userIds.get(loadEmail('DOCENTE', index + 1)), 'docente'), recordedAt: now, updatedAt: now };
    }),
  );
  for (const part of chunks(records)) await db.insert(attendanceRecords).values(part);
  const absences = await db.select({ id: attendanceRecords.id }).from(attendanceRecords).where(eq(attendanceRecords.status, 'FALTA_INJUSTIFICADA'));
  for (const part of chunks(absences)) await db.insert(followUps).values(part.map((absence) => ({ attendanceRecordId: absence.id, openedAt: now, createdAt: now, updatedAt: now })));
}

async function main(): Promise<void> {
  const url = process.env['TEST_DATABASE_URL'];
  if (!url) throw new Error('Define TEST_DATABASE_URL (una base que termine en _test; se vacía por completo).');
  const now = new Date();
  await dropAllObjects(url);
  await applyMigrations(url, SQL_DIR);
  const connection = connect(url);
  try {
    const { db } = connection;
    await syncRolePermissions(db);
    await seedDevelopmentData(db, LOAD_PASSWORD);
    const schoolYearId = requireOne(await db.select({ id: ciclosEscolares.id }).from(ciclosEscolares), 'ciclo escolar').id;
    const roomsByEstancia = await seedEstanciasAndRooms(db, now);
    const estanciaIds = [...roomsByEstancia.keys()].sort((a, b) => a - b);
    const userIds = await seedUsers(db, now, estanciaIds);
    const enrollmentsByEstancia = await seedChildren(db, now, estanciaIds, roomsByEstancia, schoolYearId);
    await seedYesterday(db, now, estanciaIds, enrollmentsByEstancia, userIds, schoolYearId);
    process.stdout.write(`Carga lista: ${ESTANCIAS} estancias, ${ESTANCIAS * CHILDREN_PER_ESTANCIA} infantes, dominio ${LOAD_DOMAIN}.\n`);
  } finally {
    await connection.close();
  }
}

void main();
