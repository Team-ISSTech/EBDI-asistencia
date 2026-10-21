import { generatesFollowUp } from '@sirai/domain';
import { eq } from 'drizzle-orm';
import { attendanceRecords, followUpContacts, followUps, jornadasAsistencia, medicalReleases } from '../schema/index.js';
import { attendanceStatusFor, followUpScenario, type FollowUpScenario, type Rng } from './demo-data.js';
import type { DemoTx, EnrolledChild, RosterContext } from './demo-roster.js';

const MS_PER_HOUR = 3_600_000;
const MS_PER_MINUTE = 60_000;
/** America/Mexico_City: UTC-6 todo el año desde 2022 (la zona horaria por omisión de una estancia). */
const LOCAL_TO_UTC_HOURS = 6;
const ABSENCE_CUTOFF_HOUR = 9;
const SHIFT_HOURS: Record<string, { open: number; close: number }> = { MATUTINO: { open: 8, close: 14 }, VESPERTINO: { open: 14, close: 19 } };
/** Los tickets de los dos días más recientes quedan abiertos para que quien prueba los trabaje. */
const OPEN_RECENT_DAYS = 2;
const QR_SHARE = 0.2;
const MAX_ARRIVAL_DELAY_MINUTES = 45;

const localInstant = (date: string, hour: number): Date => new Date(new Date(`${date}T00:00:00Z`).getTime() + (hour + LOCAL_TO_UTC_HOURS) * MS_PER_HOUR);

export interface AttendanceContext extends RosterContext {
  readonly rng: Rng;
  /** Días hábiles pasados, del más reciente al más antiguo. */
  readonly days: readonly string[];
  /** Folio que hace único el `uuid_cliente` de cada asistencia en toda la semilla. */
  readonly nextClientId: () => string;
}

export interface AttendanceSummary {
  journeys: number;
  records: number;
  followUps: number;
}

const insertJourney = async (tx: DemoTx, context: AttendanceContext, date: string, shift: string): Promise<{ id: number; openedAt: Date; closedAt: Date }> => {
  const hours = SHIFT_HOURS[shift] as { open: number; close: number };
  const openedAt = localInstant(date, hours.open);
  const closedAt = localInstant(date, hours.close);
  const [created] = await tx.insert(jornadasAsistencia).values({
    estanciaId: context.estanciaId,
    schoolYearId: context.schoolYearId,
    date,
    shift,
    status: 'CERRADA',
    openedAt,
    closedAt,
    openedBy: context.actors.directoraId,
    closedBy: context.actors.directoraId,
    createdAt: openedAt,
  });
  return { id: created.insertId, openedAt, closedAt };
};

const recordValues = (context: AttendanceContext, journey: { id: number; openedAt: Date; closedAt: Date }, child: EnrolledChild) => {
  const status = attendanceStatusFor(context.rng);
  const present = status === 'PRESENTE';
  const arrival = new Date(journey.openedAt.getTime() + context.rng.int(0, MAX_ARRIVAL_DELAY_MINUTES) * MS_PER_MINUTE);
  const recordedAt = new Date(journey.openedAt.getTime() + MS_PER_HOUR);
  return {
    journeyId: journey.id,
    enrollmentId: child.enrollmentId,
    status,
    enteredAt: present ? arrival : null,
    leftAt: present ? new Date(journey.closedAt.getTime() - 30 * MS_PER_MINUTE) : null,
    method: present && context.rng.chance(QR_SHARE) ? 'QR' : 'MANUAL',
    clientId: context.nextClientId(),
    recordedBy: context.actors.docenteId,
    recordedAt,
    updatedAt: recordedAt,
  };
};

const insertContacts = async (tx: DemoTx, context: AttendanceContext, followUpId: number, child: EnrolledChild, scenario: FollowUpScenario): Promise<void> => {
  for (const contact of scenario.contacts) {
    await tx.insert(followUpContacts).values({
      followUpId,
      guardianId: child.primaryGuardianId,
      attemptNumber: contact.attemptNumber,
      occurredAt: contact.occurredAt,
      result: contact.result,
      phoneEncrypted: child.primaryPhone === null ? null : context.cipher.encrypt(child.primaryPhone),
      notesEncrypted: contact.notes === null ? null : context.cipher.encrypt(contact.notes),
      nextAttemptAt: contact.nextAttemptAt,
      registeredBy: context.actors.trabajoSocialId,
      createdAt: contact.occurredAt,
      updatedAt: contact.occurredAt,
    });
  }
};

const insertFollowUp = async (tx: DemoTx, context: AttendanceContext, input: { recordId: number; child: EnrolledChild; scenario: FollowUpScenario; openedAt: Date; serial: number }): Promise<void> => {
  const { scenario, openedAt } = input;
  const [created] = await tx.insert(followUps).values({
    attendanceRecordId: input.recordId,
    cause: scenario.cause,
    status: scenario.status,
    expectedReturnDate: scenario.expectedReturnDate,
    requiresMedicalRelease: scenario.requiresMedicalRelease,
    assigneeId: scenario.status === 'ABIERTO' ? null : context.actors.trabajoSocialId,
    openedAt,
    closedAt: scenario.closedAt,
    createdAt: openedAt,
    updatedAt: scenario.closedAt ?? scenario.contacts.at(-1)?.occurredAt ?? openedAt,
  });
  await insertContacts(tx, context, created.insertId, input.child, scenario);
  if (scenario.release && scenario.closedAt) {
    await tx.insert(medicalReleases).values({
      followUpId: created.insertId,
      dischargeDate: scenario.closedAt.toISOString().slice(0, 10),
      doctorId: context.actors.medicoId,
      folio: `ALTA-DEMO-${String(input.serial).padStart(4, '0')}`,
      observationsEncrypted: context.cipher.encrypt('Dato de prueba: alta sin restricciones.'),
      createdAt: scenario.closedAt,
    });
  }
};

const seedShiftDay = async (tx: DemoTx, context: AttendanceContext, input: { date: string; dayRank: number; shift: string; roster: readonly EnrolledChild[] }, absences: { next: () => number }): Promise<{ records: number; followUps: number }> => {
  const journey = await insertJourney(tx, context, input.date, input.shift);
  const members = input.roster.filter((child) => child.shift === input.shift);
  await tx.insert(attendanceRecords).values(members.map((child) => recordValues(context, journey, child)));
  const saved = await tx.select({ id: attendanceRecords.id, enrollmentId: attendanceRecords.enrollmentId, status: attendanceRecords.status }).from(attendanceRecords).where(eq(attendanceRecords.journeyId, journey.id));
  const openedAt = localInstant(input.date, ABSENCE_CUTOFF_HOUR);
  let created = 0;
  for (const record of saved.filter((row) => generatesFollowUp(row.status as Parameters<typeof generatesFollowUp>[0]))) {
    const child = members.find((member) => member.enrollmentId === record.enrollmentId) as EnrolledChild;
    const serial = absences.next();
    const scenario = followUpScenario(serial, input.dayRank, OPEN_RECENT_DAYS, openedAt);
    await insertFollowUp(tx, context, { recordId: record.id, child, scenario, openedAt, serial });
    created += 1;
  }
  return { records: members.length, followUps: created };
};

/**
 * Una jornada cerrada por turno y por día hábil pasado, con asistencia de todos los infantes del turno y un
 * seguimiento por cada ausencia (S-08). Hoy no se siembra: queda libre para abrir la jornada y pasar lista.
 */
export async function seedAttendance(tx: DemoTx, context: AttendanceContext, roster: readonly EnrolledChild[], firstAbsenceSerial: number): Promise<AttendanceSummary & { absences: number }> {
  const shifts = [...new Set(roster.map((child) => child.shift))];
  const summary = { journeys: 0, records: 0, followUps: 0, absences: firstAbsenceSerial };
  const absences = { next: () => (summary.absences += 1) };
  // Del más antiguo al más reciente, para que los folios de ausencia crezcan con el tiempo.
  for (const [dayRank, date] of [...context.days.entries()].reverse()) {
    for (const shift of shifts) {
      const result = await seedShiftDay(tx, context, { date, dayRank, shift, roster }, absences);
      summary.journeys += 1;
      summary.records += result.records;
      summary.followUps += result.followUps;
    }
  }
  return summary;
}
