import { Inject, Injectable } from '@nestjs/common';
import { ABSENCE_STATUSES, CONTACT_RESULTS, FOLLOW_UP_CAUSES, FOLLOW_UP_STATUSES, type ContactResult, type FollowUpCause, type FollowUpStatus } from '@sirai/domain';
import { schema, type Db } from '@sirai/db';
import { and, asc, eq, gte, inArray, isNull, ne, notExists, sql } from 'drizzle-orm';
import { ApiError } from '../../../common/errors/api-error.js';
import { DB } from '../../../common/database/database.module.js';
import type { AuditExecutor } from '../../../common/audit/audit.service.js';
import type { AbsenceCandidate, ContactRow, FollowUpDetail, FollowUpRow, NewContact, NewRelease, TicketChange } from '../follow-ups.types.js';
import type { FollowUpsRepository, TicketHook } from './follow-ups.repository.js';

const { attendanceRecords, jornadasAsistencia, estancias, followUps, followUpContacts, medicalReleases, enrollments, children, rooms, childGuardians, guardians } = schema;
const DUPLICATE_ENTRY = 'ER_DUP_ENTRY';

const driverCode = (error: unknown): string | null => {
  if (typeof error !== 'object' || error === null) return null;
  const { code, cause } = error as { code?: unknown; cause?: unknown };
  return typeof code === 'string' ? code : driverCode(cause);
};

const pick = <T extends string>(allowed: readonly T[], value: string): T => {
  if (!(allowed as readonly string[]).includes(value)) throw new Error(`Valor no reconocido: ${value}`);
  return value as T;
};

const fullName = (name: string, paternal: string, maternal: string | null): string => [name, paternal, maternal].filter((part): part is string => Boolean(part)).join(' ');

@Injectable()
export class DrizzleFollowUpsRepository implements FollowUpsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async findAbsencesWithoutTicket(sinceDate: string): Promise<AbsenceCandidate[]> {
    return this.db
      .select({ recordId: attendanceRecords.id, estanciaId: jornadasAsistencia.estanciaId, journeyDate: jornadasAsistencia.date, timeZone: estancias.timeZone })
      .from(attendanceRecords)
      .innerJoin(jornadasAsistencia, eq(jornadasAsistencia.id, attendanceRecords.journeyId))
      .innerJoin(estancias, eq(estancias.id, jornadasAsistencia.estanciaId))
      .where(
        and(
          inArray(attendanceRecords.status, [...ABSENCE_STATUSES]),
          eq(jornadasAsistencia.shift, 'MATUTINO'),
          gte(jornadasAsistencia.date, sinceDate),
          notExists(this.db.select({ one: sql`1` }).from(followUps).where(eq(followUps.attendanceRecordId, attendanceRecords.id))),
        ),
      );
  }

  async openTickets(candidates: readonly AbsenceCandidate[], now: Date, hook: TicketHook): Promise<number> {
    return this.db.transaction(async (tx) => {
      let created = 0;
      for (const candidate of candidates) {
        const [result] = await tx
          .insert(followUps)
          .ignore()
          .values({ attendanceRecordId: candidate.recordId, openedAt: now, createdAt: now, updatedAt: now });
        if (result.affectedRows === 0) continue;
        await hook(tx, candidate, result.insertId);
        created += 1;
      }
      return created;
    });
  }

  /** Consulta base de un ticket con su infante, sala y ausencia, acotada a la estancia. */
  private ticketQuery(estanciaId: number) {
    return this.db
      .select({
        id: followUps.id,
        childId: children.id,
        name: children.name,
        paternalSurname: children.paternalSurname,
        maternalSurname: children.maternalSurname,
        enrollmentNumber: children.enrollmentNumber,
        roomName: rooms.name,
        absenceDate: jornadasAsistencia.date,
        absenceStatus: attendanceRecords.status,
        status: followUps.status,
        cause: followUps.cause,
        expectedReturnDate: followUps.expectedReturnDate,
        requiresMedicalRelease: followUps.requiresMedicalRelease,
        releaseId: medicalReleases.id,
        openedAt: followUps.openedAt,
      })
      .from(followUps)
      .leftJoin(medicalReleases, eq(medicalReleases.followUpId, followUps.id))
      .innerJoin(attendanceRecords, eq(attendanceRecords.id, followUps.attendanceRecordId))
      .innerJoin(jornadasAsistencia, eq(jornadasAsistencia.id, attendanceRecords.journeyId))
      .innerJoin(enrollments, eq(enrollments.id, attendanceRecords.enrollmentId))
      .innerJoin(children, eq(children.id, enrollments.childId))
      .innerJoin(rooms, eq(rooms.id, enrollments.roomId))
      .where(and(eq(jornadasAsistencia.estanciaId, estanciaId), isNull(followUps.deletedAt)));
  }

  async listOpen(estanciaId: number): Promise<FollowUpRow[]> {
    const rows = await this.ticketQuery(estanciaId).$dynamic().where(and(eq(jornadasAsistencia.estanciaId, estanciaId), isNull(followUps.deletedAt), ne(followUps.status, 'CERRADO'))).orderBy(asc(followUps.openedAt), asc(followUps.id));
    return this.withAttempts(rows);
  }

  async findOne(id: number, estanciaId: number): Promise<FollowUpRow | null> {
    const rows = await this.ticketQuery(estanciaId).$dynamic().where(and(eq(jornadasAsistencia.estanciaId, estanciaId), isNull(followUps.deletedAt), eq(followUps.id, id)));
    return (await this.withAttempts(rows))[0] ?? null;
  }

  async findDetail(id: number, estanciaId: number): Promise<FollowUpDetail | null> {
    const row = await this.findOne(id, estanciaId);
    if (!row) return null;
    return {
      id: row.id,
      childId: row.childId,
      status: row.status,
      cause: row.cause,
      requiresMedicalRelease: row.requiresMedicalRelease,
      expectedReturnDate: row.expectedReturnDate,
      released: row.medicalReleased,
      attemptCount: row.attemptCount,
      failedAttempts: row.failedAttempts,
    };
  }

  async findContactOperation(operationId: string): Promise<number | null> {
    const [row] = await this.db.select({ followUpId: followUpContacts.followUpId }).from(followUpContacts).where(eq(followUpContacts.operationId, operationId));
    return row?.followUpId ?? null;
  }

  async findGuardianPhone(childId: number, guardianId: number): Promise<{ phoneEncrypted: Buffer | null } | null> {
    const [row] = await this.db
      .select({ phone: guardians.phoneEncrypted })
      .from(childGuardians)
      .innerJoin(guardians, eq(guardians.id, childGuardians.guardianId))
      .where(and(eq(childGuardians.childId, childId), eq(childGuardians.guardianId, guardianId), isNull(guardians.deletedAt), isNull(childGuardians.deletedAt)));
    return row ? { phoneEncrypted: row.phone } : null;
  }

  async registerContact(
    followUpId: number,
    contact: NewContact,
    change: TicketChange,
    context: { readonly userId: number; readonly now: Date },
    hook: (executor: AuditExecutor, contactId: number) => Promise<void>,
  ): Promise<number> {
    try {
      return await this.db.transaction(async (tx) => {
        const [created] = await tx.insert(followUpContacts).values({
          followUpId,
          guardianId: contact.guardianId,
          attemptNumber: contact.attemptNumber,
          occurredAt: context.now,
          result: contact.result,
          phoneEncrypted: contact.phoneEncrypted,
          notesEncrypted: contact.notesEncrypted,
          nextAttemptAt: contact.nextAttemptAt,
          operationId: contact.operationId,
          registeredBy: context.userId,
          createdAt: context.now,
          updatedAt: context.now,
        });
        await tx
          .update(followUps)
          .set({ status: change.status, cause: change.cause, requiresMedicalRelease: change.requiresMedicalRelease, expectedReturnDate: change.expectedReturnDate, updatedAt: context.now })
          .where(eq(followUps.id, followUpId));
        await hook(tx, created.insertId);
        return created.insertId;
      });
    } catch (error) {
      if (driverCode(error) === DUPLICATE_ENTRY) throw new ApiError('CONFLICTO', 'Otra persona registró un intento al mismo tiempo; actualiza la pantalla.');
      throw error;
    }
  }

  async registerRelease(
    followUpId: number,
    release: NewRelease,
    context: { readonly userId: number; readonly now: Date },
    hook: (executor: AuditExecutor) => Promise<void>,
  ): Promise<void> {
    try {
      await this.db.transaction(async (tx) => {
        await tx.insert(medicalReleases).values({
          followUpId,
          dischargeDate: release.dischargeDate,
          doctorId: context.userId,
          folio: release.folio,
          observationsEncrypted: release.observationsEncrypted,
          createdAt: context.now,
        });
        await tx.update(followUps).set({ updatedAt: context.now }).where(eq(followUps.id, followUpId));
        await hook(tx);
      });
    } catch (error) {
      if (driverCode(error) === DUPLICATE_ENTRY) throw new ApiError('CONFLICTO', 'El alta médica de este caso ya está registrada.');
      throw error;
    }
  }

  async closeTicket(followUpId: number, closedAt: Date, hook: (executor: AuditExecutor) => Promise<void>): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [result] = await tx
        .update(followUps)
        .set({ status: 'CERRADO', closedAt, updatedAt: closedAt })
        .where(and(eq(followUps.id, followUpId), ne(followUps.status, 'CERRADO')));
      if (result.affectedRows === 0) throw new ApiError('CONFLICTO', 'El seguimiento ya está cerrado.');
      await hook(tx);
    });
  }

  async listContacts(followUpId: number): Promise<ContactRow[]> {
    const rows = await this.db
      .select()
      .from(followUpContacts)
      .where(and(eq(followUpContacts.followUpId, followUpId), isNull(followUpContacts.deletedAt)))
      .orderBy(asc(followUpContacts.attemptNumber));
    return rows.map((row) => ({
      id: row.id,
      attemptNumber: row.attemptNumber,
      occurredAt: row.occurredAt,
      result: pick<ContactResult>(CONTACT_RESULTS, row.result),
      guardianId: row.guardianId,
      notesEncrypted: row.notesEncrypted,
      nextAttemptAt: row.nextAttemptAt,
    }));
  }

  /** Intentos totales, fallidos y el próximo programado, calculados de los contactos de cada ticket. */
  private async withAttempts(rows: Awaited<ReturnType<DrizzleFollowUpsRepository['ticketQuery']>>): Promise<FollowUpRow[]> {
    if (rows.length === 0) return [];
    const contacts = await this.db
      .select({ followUpId: followUpContacts.followUpId, attemptNumber: followUpContacts.attemptNumber, result: followUpContacts.result, nextAttemptAt: followUpContacts.nextAttemptAt })
      .from(followUpContacts)
      .where(and(inArray(followUpContacts.followUpId, rows.map((row) => row.id)), isNull(followUpContacts.deletedAt)))
      .orderBy(asc(followUpContacts.attemptNumber));
    return rows.map((row) => {
      const own = contacts.filter((contact) => contact.followUpId === row.id);
      return {
        id: row.id,
        childId: row.childId,
        childName: fullName(row.name, row.paternalSurname, row.maternalSurname),
        enrollmentNumber: row.enrollmentNumber,
        roomName: row.roomName,
        absenceDate: row.absenceDate,
        absenceStatus: pick(ABSENCE_STATUSES, row.absenceStatus),
        status: pick<FollowUpStatus>(FOLLOW_UP_STATUSES, row.status),
        cause: row.cause === null ? null : pick<FollowUpCause>(FOLLOW_UP_CAUSES, row.cause),
        expectedReturnDate: row.expectedReturnDate,
        requiresMedicalRelease: row.requiresMedicalRelease,
        medicalReleased: row.releaseId !== null,
        attemptCount: own.length,
        failedAttempts: own.filter((contact) => contact.result === 'SIN_RESPUESTA').length,
        nextAttemptAt: own.at(-1)?.nextAttemptAt ?? null,
        openedAt: row.openedAt,
      };
    });
  }
}
