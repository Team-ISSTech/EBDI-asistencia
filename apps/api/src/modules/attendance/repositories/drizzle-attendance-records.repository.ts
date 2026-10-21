import { Inject, Injectable } from '@nestjs/common';
import { ATTENDANCE_STATUSES, isShift, type AttendanceStatus, type Shift } from '@sirai/domain';
import { schema, type Db } from '@sirai/db';
import { and, asc, count, eq, inArray, isNull, ne } from 'drizzle-orm';
import { alias } from 'drizzle-orm/mysql-core';
import { DB } from '../../../common/database/database.module.js';
import { ApiError } from '../../../common/errors/api-error.js';
import type { EnrollmentForMarking, ExistingMark, MarkChange, RosterRow } from '../records.types.js';
import type { AttendanceRecordsRepository, MarkChangeHook } from './records.repository.js';

const { attendanceRecords, attendanceIncidents, enrollments, children, rooms, followUps, medicalReleases } = schema;

const requireStatus = (value: string): AttendanceStatus => {
  if (!(ATTENDANCE_STATUSES as readonly string[]).includes(value)) throw new Error(`Estado de asistencia no reconocido: ${value}`);
  return value as AttendanceStatus;
};

const requireShift = (value: string): Shift => {
  if (!isShift(value)) throw new Error(`Turno no reconocido: ${value}`);
  return value;
};

const fullName = (name: string, paternal: string, maternal: string | null): string => [name, paternal, maternal].filter((part): part is string => Boolean(part)).join(' ');

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
        leftAt: attendanceRecords.leftAt,
      })
      .from(enrollments)
      .innerJoin(children, eq(children.id, enrollments.childId))
      .innerJoin(rooms, eq(rooms.id, enrollments.roomId))
      .leftJoin(attendanceRecords, and(eq(attendanceRecords.enrollmentId, enrollments.id), eq(attendanceRecords.journeyId, journeyId)))
      .where(and(activeIn(estanciaId), eq(rooms.shift, shift)))
      .orderBy(asc(rooms.name), asc(children.paternalSurname), asc(children.maternalSurname), asc(children.name));
    const locked = await this.lockedChildIds(rows.map((row) => row.childId));
    const incidents = await this.incidentCounts(journeyId);
    return rows.map((row) => ({
      enrollmentId: row.enrollmentId,
      childId: row.childId,
      childName: fullName(row.name, row.paternalSurname, row.maternalSurname),
      enrollmentNumber: row.enrollmentNumber,
      roomId: row.roomId,
      roomName: row.roomName,
      status: row.status === null ? null : requireStatus(row.status),
      medicalLock: locked.has(row.childId),
      leftAt: row.leftAt,
      incidentCount: incidents.get(row.enrollmentId) ?? 0,
    }));
  }

  /** S-27: incidencias vigentes por inscripción en la jornada, en una sola consulta para toda la lista. */
  private async incidentCounts(journeyId: number): Promise<Map<number, number>> {
    const rows = await this.db
      .select({ enrollmentId: attendanceRecords.enrollmentId, total: count() })
      .from(attendanceIncidents)
      .innerJoin(attendanceRecords, eq(attendanceRecords.id, attendanceIncidents.attendanceRecordId))
      .where(and(eq(attendanceRecords.journeyId, journeyId), isNull(attendanceIncidents.deletedAt)))
      .groupBy(attendanceRecords.enrollmentId);
    return new Map(rows.map((row) => [row.enrollmentId, row.total]));
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
      .select({ id: enrollments.id, childId: enrollments.childId })
      .from(enrollments)
      .innerJoin(children, eq(children.id, enrollments.childId))
      .where(and(activeIn(estanciaId), inArray(enrollments.id, [...enrollmentIds])));
    const locked = await this.lockedChildIds(rows.map((row) => row.childId));
    return new Set(rows.filter((row) => locked.has(row.childId)).map((row) => row.id));
  }

  /**
   * RF-29: infantes con un caso abierto que requiere alta médica y aún no la tiene. El candado sigue al infante,
   * no a una inscripción: un traslado no lo libera. Se parte de los infantes pedidos (índice por infante) en vez de
   * recorrer todos los casos abiertos de la red por cada fila de la lista.
   */
  private async lockedChildIds(childIds: readonly number[]): Promise<Set<number>> {
    if (childIds.length === 0) return new Set();
    const history = alias(enrollments, 'inscripcion_historial');
    const rows = await this.db
      .selectDistinct({ childId: history.childId })
      .from(history)
      .innerJoin(attendanceRecords, eq(attendanceRecords.enrollmentId, history.id))
      .innerJoin(followUps, eq(followUps.attendanceRecordId, attendanceRecords.id))
      .leftJoin(medicalReleases, eq(medicalReleases.followUpId, followUps.id))
      .where(and(inArray(history.childId, [...childIds]), eq(followUps.requiresMedicalRelease, true), isNull(medicalReleases.id), ne(followUps.status, 'CERRADO'), isNull(followUps.deletedAt)));
    return new Set(rows.map((row) => row.childId));
  }

  async findMarks(journeyId: number, enrollmentIds: readonly number[]): Promise<ExistingMark[]> {
    const rows = await this.db
      .select({ enrollmentId: attendanceRecords.enrollmentId, status: attendanceRecords.status, leftAt: attendanceRecords.leftAt })
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.journeyId, journeyId), inArray(attendanceRecords.enrollmentId, [...enrollmentIds])));
    return rows.map((row) => ({ enrollmentId: row.enrollmentId, status: requireStatus(row.status), leftAt: row.leftAt }));
  }

  async findAppliedClientIds(clientIds: readonly string[]): Promise<Set<string>> {
    const rows = await this.db.select({ clientId: attendanceRecords.clientId }).from(attendanceRecords).where(inArray(attendanceRecords.clientId, [...clientIds]));
    return new Set(rows.map((row) => row.clientId));
  }

  async applyChanges(journeyId: number, userId: number, now: Date, changes: readonly MarkChange[], hook: MarkChangeHook): Promise<void> {
    await this.db.transaction(async (tx) => {
      const created = changes.filter((change) => change.plan === 'CREATE');
      // Una sola sentencia para todos los registros nuevos: 212 estancias pasan lista a la vez (RNF-08).
      if (created.length > 0) await tx.insert(attendanceRecords).values(created.map((change) => this.row(journeyId, userId, now, change)));
      for (const change of changes.filter((item) => item.plan === 'CHANGE')) await this.update(tx, journeyId, now, change);
      const ids = await this.recordIds(tx, journeyId, changes);
      await hook(tx, changes.map((change) => ({ change, recordId: this.requireId(ids, change) })));
    });
  }

  private row(journeyId: number, userId: number, now: Date, change: MarkChange) {
    return {
      journeyId,
      enrollmentId: change.enrollmentId,
      status: change.status,
      enteredAt: change.status === 'PRESENTE' ? now : null,
      method: change.method,
      clientId: change.clientId,
      recordedBy: userId,
      recordedAt: now,
      updatedAt: now,
    };
  }

  private async recordIds(tx: Pick<Db, 'select'>, journeyId: number, changes: readonly MarkChange[]): Promise<Map<number, number>> {
    const rows = await tx
      .select({ id: attendanceRecords.id, enrollmentId: attendanceRecords.enrollmentId })
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.journeyId, journeyId), inArray(attendanceRecords.enrollmentId, changes.map((change) => change.enrollmentId))));
    return new Map(rows.map((row) => [row.enrollmentId, row.id]));
  }

  private requireId(ids: ReadonlyMap<number, number>, change: MarkChange): number {
    const id = ids.get(change.enrollmentId);
    if (id === undefined) throw new Error('No se encontró el registro de asistencia que se acababa de guardar.');
    return id;
  }

  /** El `uuid_cliente` conserva el de la operación que creó el registro. */
  private async update(tx: Pick<Db, 'update'>, journeyId: number, now: Date, change: MarkChange): Promise<void> {
    const [result] = await tx
      .update(attendanceRecords)
      .set({ status: change.status, method: change.method, enteredAt: change.status === 'PRESENTE' ? now : null, updatedAt: now })
      .where(and(eq(attendanceRecords.journeyId, journeyId), eq(attendanceRecords.enrollmentId, change.enrollmentId), isNull(attendanceRecords.leftAt)));
    // S-27: si la salida se registró entre la lectura y esta escritura, el lote completo se deshace.
    if (result.affectedRows === 0) throw new ApiError('CONFLICTO', 'El infante ya tiene registrada su salida; su asistencia del día no cambia.');
  }
}
