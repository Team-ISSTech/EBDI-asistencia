import { Inject, Injectable } from '@nestjs/common';
import { ABSENCE_STATUSES, FOLLOW_UP_CAUSES, FOLLOW_UP_STATUSES, type FollowUpCause, type FollowUpStatus } from '@sirai/domain';
import { schema, type Db } from '@sirai/db';
import { and, asc, eq, gte, inArray, isNull, ne, notExists, sql } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module.js';
import type { AbsenceCandidate, FollowUpRow } from '../follow-ups.types.js';
import type { FollowUpsRepository, TicketHook } from './follow-ups.repository.js';

const { attendanceRecords, jornadasAsistencia, estancias, followUps, enrollments, children, rooms } = schema;

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

  async listOpen(estanciaId: number): Promise<FollowUpRow[]> {
    const rows = await this.db
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
        openedAt: followUps.openedAt,
      })
      .from(followUps)
      .innerJoin(attendanceRecords, eq(attendanceRecords.id, followUps.attendanceRecordId))
      .innerJoin(jornadasAsistencia, eq(jornadasAsistencia.id, attendanceRecords.journeyId))
      .innerJoin(enrollments, eq(enrollments.id, attendanceRecords.enrollmentId))
      .innerJoin(children, eq(children.id, enrollments.childId))
      .innerJoin(rooms, eq(rooms.id, enrollments.roomId))
      .where(and(eq(jornadasAsistencia.estanciaId, estanciaId), ne(followUps.status, 'CERRADO'), isNull(followUps.deletedAt)))
      .orderBy(asc(followUps.openedAt), asc(followUps.id));
    return rows.map((row) => ({
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
      openedAt: row.openedAt,
    }));
  }
}
