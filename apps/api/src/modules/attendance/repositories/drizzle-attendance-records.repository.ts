import { Inject, Injectable } from '@nestjs/common';
import { ATTENDANCE_STATUSES, isShift, type AttendanceStatus, type Shift } from '@sirai/domain';
import { schema, type Db } from '@sirai/db';
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module.js';
import type { EnrollmentForMarking, ExistingMark, MarkChange, RosterRow } from '../records.types.js';
import type { AttendanceRecordsRepository, MarkChangeHook } from './records.repository.js';

const { attendanceRecords, enrollments, children, rooms } = schema;

const requireStatus = (value: string): AttendanceStatus => {
  if (!(ATTENDANCE_STATUSES as readonly string[]).includes(value)) throw new Error(`Estado de asistencia no reconocido: ${value}`);
  return value as AttendanceStatus;
};

const requireShift = (value: string): Shift => {
  if (!isShift(value)) throw new Error(`Turno no reconocido: ${value}`);
  return value;
};

const fullName = (name: string, paternal: string, maternal: string | null): string => [name, paternal, maternal].filter((part): part is string => Boolean(part)).join(' ');

/**
 * RF-29: el infante tiene un caso abierto que requiere alta médica y aún no la
 * tiene. Sigue al infante, no a una inscripción: un traslado no lo libera.
 */
const medicalLockExpr = sql<number>`EXISTS (
  SELECT 1 FROM seguimientos s
  INNER JOIN asistencias a ON a.id = s.asistencia_id
  INNER JOIN inscripciones e2 ON e2.id = a.inscripcion_id
  LEFT JOIN altas_medicas m ON m.seguimiento_id = s.id
  WHERE e2.infante_id = ${enrollments.childId}
    AND s.requiere_alta_medica = 1
    AND m.id IS NULL
    AND s.estado <> 'CERRADO'
    AND s.deleted_at IS NULL
)`.mapWith(Boolean);

/** Inscripciones activas, sin borrado lógico, de una estancia. */
const activeIn = (estanciaId: number) =>
  and(eq(enrollments.estanciaId, estanciaId), eq(enrollments.status, 'ACTIVA'), isNull(enrollments.deletedAt), isNull(children.deletedAt));

@Injectable()
export class DrizzleAttendanceRecordsRepository implements AttendanceRecordsRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async listRoster(estanciaId: number, journeyId: number, shift: Shift): Promise<RosterRow[]> {
    const rows = await this.db
      .select({
        enrollmentId: enrollments.id,
        childId: children.id,
        name: children.name,
        paternalSurname: children.paternalSurname,
        maternalSurname: children.maternalSurname,
        enrollmentNumber: children.enrollmentNumber,
        roomId: rooms.id,
        roomName: rooms.name,
        status: attendanceRecords.status,
        medicalLock: medicalLockExpr,
      })
      .from(enrollments)
      .innerJoin(children, eq(children.id, enrollments.childId))
      .innerJoin(rooms, eq(rooms.id, enrollments.roomId))
      .leftJoin(attendanceRecords, and(eq(attendanceRecords.enrollmentId, enrollments.id), eq(attendanceRecords.journeyId, journeyId)))
      .where(and(activeIn(estanciaId), eq(rooms.shift, shift)))
      .orderBy(asc(rooms.name), asc(children.paternalSurname), asc(children.maternalSurname), asc(children.name));
    return rows.map((row) => ({
      enrollmentId: row.enrollmentId,
      childId: row.childId,
      childName: fullName(row.name, row.paternalSurname, row.maternalSurname),
      enrollmentNumber: row.enrollmentNumber,
      roomId: row.roomId,
      roomName: row.roomName,
      status: row.status === null ? null : requireStatus(row.status),
      medicalLock: row.medicalLock,
    }));
  }

  async findEnrollments(estanciaId: number, enrollmentIds: readonly number[]): Promise<EnrollmentForMarking[]> {
    if (enrollmentIds.length === 0) return [];
    const rows = await this.db
      .select({ enrollmentId: enrollments.id, shift: rooms.shift })
      .from(enrollments)
      .innerJoin(children, eq(children.id, enrollments.childId))
      .innerJoin(rooms, eq(rooms.id, enrollments.roomId))
      .where(and(activeIn(estanciaId), inArray(enrollments.id, [...enrollmentIds])));
    return rows.map((row) => ({ enrollmentId: row.enrollmentId, roomShift: requireShift(row.shift) }));
  }

  async findLockedEnrollmentIds(estanciaId: number, enrollmentIds: readonly number[]): Promise<Set<number>> {
    if (enrollmentIds.length === 0) return new Set();
    const rows = await this.db
      .select({ id: enrollments.id })
      .from(enrollments)
      .innerJoin(children, eq(children.id, enrollments.childId))
      .where(and(activeIn(estanciaId), inArray(enrollments.id, [...enrollmentIds]), medicalLockExpr));
    return new Set(rows.map((row) => row.id));
  }

  async findMarks(journeyId: number, enrollmentIds: readonly number[]): Promise<ExistingMark[]> {
    const rows = await this.db
      .select({ enrollmentId: attendanceRecords.enrollmentId, status: attendanceRecords.status })
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.journeyId, journeyId), inArray(attendanceRecords.enrollmentId, [...enrollmentIds])));
    return rows.map((row) => ({ enrollmentId: row.enrollmentId, status: requireStatus(row.status) }));
  }

  async findAppliedClientIds(clientIds: readonly string[]): Promise<Set<string>> {
    const rows = await this.db.select({ clientId: attendanceRecords.clientId }).from(attendanceRecords).where(inArray(attendanceRecords.clientId, [...clientIds]));
    return new Set(rows.map((row) => row.clientId));
  }

  async applyChanges(journeyId: number, userId: number, now: Date, changes: readonly MarkChange[], hook: MarkChangeHook): Promise<void> {
    await this.db.transaction(async (tx) => {
      for (const change of changes) {
        const recordId = change.plan === 'CREATE' ? await this.insert(tx, journeyId, userId, now, change) : await this.update(tx, journeyId, now, change);
        await hook(tx, change, recordId);
      }
    });
  }

  private async insert(tx: Pick<Db, 'insert'>, journeyId: number, userId: number, now: Date, change: MarkChange): Promise<number> {
    const [result] = await tx.insert(attendanceRecords).values({
      journeyId,
      enrollmentId: change.enrollmentId,
      status: change.status,
      enteredAt: change.status === 'PRESENTE' ? now : null,
      method: change.method,
      clientId: change.clientId,
      recordedBy: userId,
      recordedAt: now,
      updatedAt: now,
    });
    return result.insertId;
  }

  /** El `uuid_cliente` conserva el de la operación que creó el registro. */
  private async update(tx: Pick<Db, 'update' | 'select'>, journeyId: number, now: Date, change: MarkChange): Promise<number> {
    const where = and(eq(attendanceRecords.journeyId, journeyId), eq(attendanceRecords.enrollmentId, change.enrollmentId));
    await tx
      .update(attendanceRecords)
      .set({ status: change.status, method: change.method, enteredAt: change.status === 'PRESENTE' ? now : null, updatedAt: now })
      .where(where);
    const [row] = await tx.select({ id: attendanceRecords.id }).from(attendanceRecords).where(where);
    if (!row) throw new Error('No se encontró el registro de asistencia que se acababa de cambiar.');
    return row.id;
  }
}
