import { resolve } from 'node:path';
import { and, count, eq, isNotNull, isNull, ne, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { connect, type DbConnection } from '../client.js';
import { applyMigrations, dropAllObjects } from '../migrate/runner.js';
import { syncRolePermissions } from '../seed/catalog.js';
import { createSeedCipher } from '../seed/demo-cipher.js';
import { DEMO_ROOM_PLANS } from '../seed/demo-data.js';
import { seedDemoData } from '../seed/demo.js';
import { devUserEmail, seedDevelopmentData } from '../seed/dev.js';
import { attendanceRecords, auditoria, childGuardians, children, consents, enrollments, estancias, followUpContacts, followUps, guardians, jornadasAsistencia, medicalReleases, rooms, roles, usuarioRol, usuarios } from '../schema/index.js';

const TEST_DATABASE_URL = process.env['TEST_DATABASE_URL'];
const SQL_DIR = resolve(import.meta.dirname, '../../sql');
const KEY = '0123456789abcdef'.repeat(4);
const NOW = new Date('2026-10-20T15:00:00Z');
const options = { encryptionKey: KEY, now: NOW, env: { NODE_ENV: 'test' } };

describe.skipIf(!TEST_DATABASE_URL)('semilla de demostración (integración)', () => {
  let connection: DbConnection;
  let first: Awaited<ReturnType<typeof seedDemoData>>;

  beforeAll(async () => {
    if (!TEST_DATABASE_URL) return;
    await dropAllObjects(TEST_DATABASE_URL);
    await applyMigrations(TEST_DATABASE_URL, SQL_DIR);
    connection = connect(TEST_DATABASE_URL);
    await syncRolePermissions(connection.db);
    await seedDevelopmentData(connection.db, 'contrasena-de-prueba');
    first = await seedDemoData(connection.db, options);
  });

  afterAll(async () => {
    await connection?.close();
  });

  it('exige haber corrido la semilla base', async () => {
    if (!TEST_DATABASE_URL) return;
    await dropAllObjects(TEST_DATABASE_URL);
    await applyMigrations(TEST_DATABASE_URL, SQL_DIR);
    await expect(seedDemoData(connection.db, options)).rejects.toThrow(/corre primero/);
    await syncRolePermissions(connection.db);
    await seedDevelopmentData(connection.db, 'contrasena-de-prueba');
    first = await seedDemoData(connection.db, options);
  });

  it('inscribe a los infantes del plan en las dos estancias, sin pasar la capacidad de ninguna sala', async () => {
    const perEstancia = DEMO_ROOM_PLANS.reduce((total, plan) => total + plan.children, 0);
    expect(first).toMatchObject({ skipped: false, children: perEstancia * 2 });
    const [total] = await connection.db.select({ n: count() }).from(children);
    expect(total?.n).toBe(perEstancia * 2);
    const occupancy = await connection.db
      .select({ room: rooms.name, capacity: rooms.capacity, n: count() })
      .from(enrollments)
      .innerJoin(rooms, eq(rooms.id, enrollments.roomId))
      .where(eq(enrollments.status, 'ACTIVA'))
      .groupBy(rooms.id, rooms.name, rooms.capacity);
    expect(occupancy).toHaveLength(DEMO_ROOM_PLANS.length * 2);
    for (const row of occupancy) expect(row.n, row.room).toBeLessThanOrEqual(row.capacity ?? Infinity);
  });

  it('los datos sensibles se guardan cifrados y el hash ciego deja buscar al tutor por teléfono', async () => {
    const rows = await connection.db.select().from(guardians);
    const withPhone = rows.filter((guardian) => guardian.phoneEncrypted !== null);
    expect(withPhone.length).toBeGreaterThan(0);
    expect(rows.some((guardian) => guardian.phoneEncrypted === null && guardian.phoneHash === null)).toBe(true);
    for (const guardian of withPhone) expect(guardian.phoneEncrypted?.toString('utf8')).not.toMatch(/5500\d{6}/);
    const cipher = createSeedCipher(KEY);
    const hashes = new Set(withPhone.map((guardian) => guardian.phoneHash?.toString('hex')));
    expect(hashes.size).toBe(withPhone.length);
    expect(hashes.has(cipher.blindHash('5500100001').toString('hex'))).toBe(true);
    const disabled = await connection.db.select().from(children).where(eq(children.hasDisability, true));
    expect(disabled.length).toBeGreaterThan(0);
    expect(disabled.every((child) => child.disabilityGroupEncrypted !== null)).toBe(true);
  });

  it('deja hoy sin jornada y cerradas las anteriores, una por estancia, turno y día hábil', async () => {
    const journeys = await connection.db.select().from(jornadasAsistencia);
    expect(journeys).toHaveLength(first.journeys);
    expect(journeys.every((journey) => journey.status === 'CERRADA' && journey.closedAt !== null)).toBe(true);
    expect(journeys.some((journey) => journey.date === '2026-10-20')).toBe(false);
    expect(new Set(journeys.map((journey) => journey.shift))).toEqual(new Set(['MATUTINO', 'VESPERTINO']));
    const [weekend] = await connection.db.select({ n: count() }).from(jornadasAsistencia).where(sql`DAYOFWEEK(${jornadasAsistencia.date}) IN (1, 7)`);
    expect(weekend?.n).toBe(0);
  });

  it('solo las ausencias tienen seguimiento y el reparto cubre abiertos, clasificados, cerrados y candado médico', async () => {
    const [orphans] = await connection.db
      .select({ n: count() })
      .from(followUps)
      .innerJoin(attendanceRecords, eq(attendanceRecords.id, followUps.attendanceRecordId))
      .where(and(ne(attendanceRecords.status, 'AUSENTE_JUSTIFICADO'), ne(attendanceRecords.status, 'FALTA_INJUSTIFICADA')));
    expect(orphans?.n).toBe(0);
    const [absences] = await connection.db.select({ n: count() }).from(attendanceRecords).where(sql`${attendanceRecords.status} IN ('AUSENTE_JUSTIFICADO', 'FALTA_INJUSTIFICADA')`);
    expect(absences?.n).toBe(first.followUps);
    const states = new Set((await connection.db.select({ status: followUps.status }).from(followUps)).map((row) => row.status));
    expect(states).toEqual(new Set(['ABIERTO', 'CLASIFICADO', 'CERRADO']));
    const locked = await connection.db
      .select({ id: followUps.id })
      .from(followUps)
      .leftJoin(medicalReleases, eq(medicalReleases.followUpId, followUps.id))
      .where(and(eq(followUps.requiresMedicalRelease, true), ne(followUps.status, 'CERRADO'), isNull(medicalReleases.id)));
    expect(locked.length).toBeGreaterThan(0);
    const [contacts] = await connection.db.select({ n: count() }).from(followUpContacts);
    expect(contacts?.n).toBeGreaterThan(0);
  });

  it('cada salida lleva un tutor autorizado a recoger a ese infante y a la docente que la registró', async () => {
    const departures = await connection.db
      .select({ childId: enrollments.childId, pickedUpBy: attendanceRecords.pickedUpBy, recordedBy: attendanceRecords.departureRecordedBy })
      .from(attendanceRecords)
      .innerJoin(enrollments, eq(enrollments.id, attendanceRecords.enrollmentId))
      .where(isNotNull(attendanceRecords.leftAt));
    expect(departures.length).toBeGreaterThan(0);
    const authorized = await connection.db.select({ childId: childGuardians.childId, guardianId: childGuardians.guardianId }).from(childGuardians).where(eq(childGuardians.canPickUp, true));
    const allowed = new Set(authorized.map((row) => `${row.childId}:${row.guardianId}`));
    const [docente] = await connection.db.select({ id: usuarios.id }).from(usuarios).where(eq(usuarios.email, devUserEmail('DOCENTE')));
    for (const departure of departures) {
      expect(allowed.has(`${departure.childId}:${departure.pickedUpBy}`), `infante ${departure.childId}`).toBe(true);
      expect(departure.recordedBy).toBe(docente?.id);
    }
  });

  it('cubre los estados de consentimiento: aceptado, rechazado y revocado', async () => {
    const rows = await connection.db.select().from(consents);
    expect(rows.some((row) => row.accepted && row.revokedAt === null)).toBe(true);
    expect(rows.some((row) => !row.accepted)).toBe(true);
    expect(rows.some((row) => row.revokedAt !== null)).toBe(true);
  });

  it('da a los roles de estancia acceso también a la segunda estancia', async () => {
    const assignments = await connection.db
      .select({ role: roles.code, estanciaId: usuarioRol.estanciaId })
      .from(usuarioRol)
      .innerJoin(usuarios, eq(usuarios.id, usuarioRol.userId))
      .innerJoin(roles, eq(roles.id, usuarioRol.roleId))
      .where(eq(usuarios.email, devUserEmail('DOCENTE')));
    expect(assignments).toHaveLength(2);
    const estanciaRows = await connection.db.select({ id: estancias.id }).from(estancias);
    expect(new Set(assignments.map((row) => row.estanciaId))).toEqual(new Set(estanciaRows.map((row) => row.id)));
  });

  it('deja rastro en la bitácora', async () => {
    const [entry] = await connection.db.select().from(auditoria).where(eq(auditoria.action, 'SEMILLA_DEMO'));
    expect(entry).toMatchObject({ roleCode: 'SISTEMA', userId: null, userAgent: 'cli:seed-demo' });
  });

  it('es repetible: una segunda corrida no cambia nada', async () => {
    const before = await connection.db.select({ n: count() }).from(children);
    const second = await seedDemoData(connection.db, options);
    expect(second).toMatchObject({ skipped: true, children: 0 });
    const after = await connection.db.select({ n: count() }).from(children);
    expect(after).toEqual(before);
  });
});
