import { and, eq } from 'drizzle-orm';
import type { Db } from '../client.js';
import { children, childGuardians, consents, enrollmentMovements, enrollments, guardians, rooms } from '../schema/index.js';
import type { SeedCipher } from './demo-cipher.js';
import { DEMO_EXTRA_ROOM, DEMO_ROOM_PLANS, type ChildPlan, type ConsentProfile, type EstanciaPlan, type FamilyPlan } from './demo-data.js';

/** Transacción de Drizzle: las mismas operaciones que `Db`, dentro de un BEGIN/COMMIT. */
export type DemoTx = Parameters<Parameters<Db['transaction']>[0]>[0];

export interface DemoActors {
  readonly directoraId: number;
  readonly docenteId: number;
  readonly trabajoSocialId: number;
  readonly medicoId: number;
}

export interface RosterContext {
  readonly estanciaId: number;
  readonly roomIds: readonly number[];
  readonly schoolYearId: number;
  readonly startDate: string;
  readonly now: Date;
  readonly actors: DemoActors;
  readonly cipher: SeedCipher;
}

/** Un infante ya inscrito, con lo que las jornadas necesitan saber de él. */
export interface EnrolledChild {
  readonly enrollmentId: number;
  readonly plan: ChildPlan;
  readonly shift: string;
  readonly primaryGuardianId: number;
  readonly primaryPhone: string | null;
  /** S-27: tutor autorizado a recoger con quien se registra la salida. */
  readonly pickupGuardianId: number;
}

const NOTICE_VERSION = 'v1.0';
const REVOKED_DAYS_AGO = 3;
const MS_PER_DAY = 86_400_000;

/** Crea (o deja como están) las salas de la semilla en una estancia; devuelve sus ids en el orden de `DEMO_ROOM_PLANS`. */
export async function ensureRooms(db: Db, estanciaId: number, now: Date): Promise<number[]> {
  const ids: number[] = [];
  for (const { room } of DEMO_ROOM_PLANS) {
    await db
      .insert(rooms)
      .values({ ...room, estanciaId, createdAt: now, updatedAt: now })
      .onDuplicateKeyUpdate({ set: { capacity: room.capacity, updatedAt: now } });
    const [row] = await db.select({ id: rooms.id }).from(rooms).where(and(eq(rooms.estanciaId, estanciaId), eq(rooms.name, room.name), eq(rooms.shift, room.shift)));
    if (!row) throw new Error(`No se pudo leer la sala ${room.name}.`);
    ids.push(row.id);
  }
  return ids;
}

const insertGuardians = async (tx: DemoTx, family: FamilyPlan, context: RosterContext): Promise<number[]> => {
  const ids: number[] = [];
  for (const guardian of family.guardians) {
    const [created] = await tx.insert(guardians).values({
      name: guardian.name,
      paternalSurname: guardian.paternalSurname,
      maternalSurname: guardian.maternalSurname,
      phoneEncrypted: guardian.phone === null ? null : context.cipher.encrypt(guardian.phone),
      phoneHash: guardian.phone === null ? null : context.cipher.blindHash(guardian.phone),
      email: guardian.email,
      createdAt: context.now,
      updatedAt: context.now,
    });
    ids.push(created.insertId);
  }
  return ids;
};

const consentRows = (profile: ConsentProfile, base: { childId: number; guardianId: number; acceptedAt: Date; registeredBy: number; now: Date }) => {
  const row = (type: 'TRATAMIENTO_DATOS_SENSIBLES' | 'CONTACTO_TELEFONICO', accepted: boolean, revokedAt: Date | null = null) => ({
    ...base,
    type,
    noticeVersion: NOTICE_VERSION,
    accepted,
    revokedAt,
    createdAt: base.now,
  });
  const revokedAt = new Date(base.now.getTime() - REVOKED_DAYS_AGO * MS_PER_DAY);
  switch (profile) {
    case 'COMPLETO':
      return [row('TRATAMIENTO_DATOS_SENSIBLES', true), row('CONTACTO_TELEFONICO', true)];
    case 'SOLO_DATOS':
      return [row('TRATAMIENTO_DATOS_SENSIBLES', true)];
    case 'RECHAZADO':
      return [row('TRATAMIENTO_DATOS_SENSIBLES', false)];
    case 'REVOCADO':
      return [row('TRATAMIENTO_DATOS_SENSIBLES', true, revokedAt), row('CONTACTO_TELEFONICO', true)];
    case 'PENDIENTE':
      return [];
  }
};

const enrollChild = async (tx: DemoTx, plan: ChildPlan, family: FamilyPlan, guardianIds: Map<string, number[]>, context: RosterContext): Promise<EnrolledChild> => {
  const { now, actors } = context;
  const [created] = await tx.insert(children).values({
    enrollmentNumber: plan.enrollmentNumber,
    name: plan.name,
    paternalSurname: plan.paternalSurname,
    maternalSurname: plan.maternalSurname,
    birthDate: plan.birthDate,
    gender: plan.gender,
    hasDisability: plan.disabilityGroup !== null,
    disabilityGroupEncrypted: plan.disabilityGroup === null ? null : context.cipher.encrypt(plan.disabilityGroup),
    createdAt: now,
    updatedAt: now,
  });
  const roomId = context.roomIds[plan.roomIndex] as number;
  const [enrollment] = await tx.insert(enrollments).values({
    childId: created.insertId,
    estanciaId: context.estanciaId,
    roomId,
    schoolYearId: context.schoolYearId,
    startDate: context.startDate,
    createdAt: now,
    updatedAt: now,
  });
  await tx.insert(enrollmentMovements).values({ enrollmentId: enrollment.insertId, type: 'ALTA', occurredAt: now, newEstanciaId: context.estanciaId, newRoomId: roomId, userId: actors.directoraId, createdAt: now });
  const ids = guardianIds.get(family.key) as number[];
  await tx.insert(childGuardians).values(
    family.guardians.map((guardian, index) => ({
      childId: created.insertId,
      guardianId: ids[index] as number,
      relationship: guardian.relationship,
      isPrimary: guardian.isPrimary,
      canPickUp: guardian.canPickUp,
      isEmergencyContact: guardian.isEmergencyContact,
      validFrom: context.startDate,
      createdAt: now,
      updatedAt: now,
    })),
  );
  const primary = family.guardians.findIndex((guardian) => guardian.isPrimary);
  const rows = consentRows(plan.consent, { childId: created.insertId, guardianId: ids[primary] as number, acceptedAt: new Date(`${context.startDate}T15:00:00Z`), registeredBy: actors.directoraId, now });
  if (rows.length > 0) await tx.insert(consents).values(rows);
  const pickup = family.guardians.findIndex((guardian) => guardian.canPickUp);
  if (pickup < 0) throw new Error(`La familia ${family.key} de la semilla no tiene ningún tutor autorizado a recoger.`);
  return {
    enrollmentId: enrollment.insertId,
    plan,
    shift: roomShift(plan.roomIndex),
    primaryGuardianId: ids[primary] as number,
    primaryPhone: family.guardians[primary]?.phone ?? null,
    pickupGuardianId: ids[pickup] as number,
  };
};

const roomShift = (roomIndex: number): string => (DEMO_ROOM_PLANS[roomIndex]?.room ?? DEMO_EXTRA_ROOM).shift;

/** Tutores, infantes, inscripciones (con su movimiento de alta), vínculos y consentimientos de una estancia. */
export async function seedRoster(tx: DemoTx, plan: EstanciaPlan, context: RosterContext): Promise<EnrolledChild[]> {
  const guardianIds = new Map<string, number[]>();
  for (const family of plan.families) guardianIds.set(family.key, await insertGuardians(tx, family, context));
  const enrolled: EnrolledChild[] = [];
  for (const child of plan.children) {
    const family = plan.families.find((candidate) => candidate.key === child.familyKey) as FamilyPlan;
    enrolled.push(await enrollChild(tx, child, family, guardianIds, context));
  }
  return enrolled;
}
