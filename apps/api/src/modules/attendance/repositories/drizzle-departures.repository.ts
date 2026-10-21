import { Inject, Injectable } from '@nestjs/common';
import { ATTENDANCE_STATUSES, INCIDENT_TYPES, type AttendanceStatus, type IncidentType } from '@sirai/domain';
import { schema, type Db } from '@sirai/db';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module.js';
import type { DayRecordRow, IncidentRow, NewDeparture, NewIncident, PickupLinkRow } from '../departures.types.js';
import type { DeparturesRepository, WriteHook } from './departures.repository.js';

const { attendanceRecords, attendanceIncidents, enrollments, children, childGuardians, guardians } = schema;

const requireStatus = (value: string): AttendanceStatus => {
  if (!(ATTENDANCE_STATUSES as readonly string[]).includes(value)) throw new Error(`Estado de asistencia no reconocido: ${value}`);
  return value as AttendanceStatus;
};

const requireIncidentType = (value: string): IncidentType => {
  if (!(INCIDENT_TYPES as readonly string[]).includes(value)) throw new Error(`Tipo de incidencia no reconocido: ${value}`);
  return value as IncidentType;
};

const fullName = (name: string, paternal: string, maternal: string | null): string => [name, paternal, maternal].filter((part): part is string => Boolean(part)).join(' ');

@Injectable()
export class DrizzleDeparturesRepository implements DeparturesRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async findChildId(estanciaId: number, enrollmentId: number): Promise<number | null> {
    const [row] = await this.db
      .select({ childId: enrollments.childId })
      .from(enrollments)
      .innerJoin(children, eq(children.id, enrollments.childId))
      .where(and(eq(enrollments.id, enrollmentId), eq(enrollments.estanciaId, estanciaId), eq(enrollments.status, 'ACTIVA'), isNull(enrollments.deletedAt), isNull(children.deletedAt)));
    return row?.childId ?? null;
  }

  async findDayRecord(journeyId: number, enrollmentId: number): Promise<DayRecordRow | null> {
    const [row] = await this.db
      .select({ id: attendanceRecords.id, status: attendanceRecords.status, leftAt: attendanceRecords.leftAt })
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.journeyId, journeyId), eq(attendanceRecords.enrollmentId, enrollmentId)));
    return row ? { id: row.id, status: requireStatus(row.status), leftAt: row.leftAt } : null;
  }

  async listPickupLinks(childId: number): Promise<PickupLinkRow[]> {
    const rows = await this.db
      .select({
        guardianId: guardians.id,
        name: guardians.name,
        paternalSurname: guardians.paternalSurname,
        maternalSurname: guardians.maternalSurname,
        guardianStatus: guardians.status,
        guardianDeletedAt: guardians.deletedAt,
        relationship: childGuardians.relationship,
        canPickUp: childGuardians.canPickUp,
        validFrom: childGuardians.validFrom,
        validUntil: childGuardians.validUntil,
        linkDeletedAt: childGuardians.deletedAt,
      })
      .from(childGuardians)
      .innerJoin(guardians, eq(guardians.id, childGuardians.guardianId))
      .where(eq(childGuardians.childId, childId))
      .orderBy(asc(guardians.paternalSurname), asc(guardians.name));
    return rows.map((row) => ({
      guardianId: row.guardianId,
      name: fullName(row.name, row.paternalSurname, row.maternalSurname),
      relationship: row.relationship,
      canPickUp: row.canPickUp,
      validFrom: row.validFrom,
      validUntil: row.validUntil,
      linkDeleted: row.linkDeletedAt !== null,
      guardianActive: row.guardianStatus === 'ACTIVO' && row.guardianDeletedAt === null,
    }));
  }

  async recordDeparture(departure: NewDeparture, hook: WriteHook): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const [result] = await tx
        .update(attendanceRecords)
        .set({ leftAt: departure.at, pickedUpBy: departure.guardianId, departureRecordedBy: departure.userId, updatedAt: departure.at })
        // También exige Presente: si otra petición cambió el estado entre la lectura y esta escritura, no hay salida.
        .where(and(eq(attendanceRecords.id, departure.recordId), isNull(attendanceRecords.leftAt), eq(attendanceRecords.status, 'PRESENTE')));
      if (result.affectedRows === 0) return false;
      await hook(tx, departure.recordId);
      return true;
    });
  }

  async createIncident(incident: NewIncident, hook: WriteHook): Promise<number> {
    return this.db.transaction(async (tx) => {
      const [result] = await tx.insert(attendanceIncidents).values({
        attendanceRecordId: incident.recordId,
        type: incident.type,
        descriptionEncrypted: incident.descriptionEncrypted,
        recordedBy: incident.userId,
        createdAt: incident.at,
        updatedAt: incident.at,
      });
      await hook(tx, result.insertId);
      return result.insertId;
    });
  }

  async listIncidents(recordId: number): Promise<IncidentRow[]> {
    const rows = await this.db
      .select({ id: attendanceIncidents.id, type: attendanceIncidents.type, descriptionEncrypted: attendanceIncidents.descriptionEncrypted, createdAt: attendanceIncidents.createdAt })
      .from(attendanceIncidents)
      .where(and(eq(attendanceIncidents.attendanceRecordId, recordId), isNull(attendanceIncidents.deletedAt)))
      .orderBy(asc(attendanceIncidents.createdAt), asc(attendanceIncidents.id));
    return rows.map((row) => ({ ...row, type: requireIncidentType(row.type) }));
  }
}
