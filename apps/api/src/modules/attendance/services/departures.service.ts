import { Inject, Injectable } from '@nestjs/common';
import type { AuthorizedPickup, Incident, RegisterDepartureRequest, RegisterDepartureResponse, RegisterIncidentRequest } from '@sirai/contracts';
import { departureBlocker, incidentBlocker, isAuthorizedPickup } from '@sirai/domain';
import { AuditService } from '../../../common/audit/audit.service.js';
import type { AuthContext } from '../../../common/auth/auth-context.js';
import { EncryptionService } from '../../../common/crypto/encryption.service.js';
import { ApiError } from '../../../common/errors/api-error.js';
import type { RequestContext } from '../../../common/http/request-context.js';
import type { AttendanceJourneyRecord } from '../attendance.types.js';
import type { DayRecordRow, IncidentRow } from '../departures.types.js';
import { DEPARTURES_REPOSITORY, type DeparturesRepository } from '../repositories/departures.repository.js';
import { ATTENDANCE_JOURNEYS_REPOSITORY, type AttendanceJourneysRepository } from '../repositories/repositories.js';
import { ATTENDANCE_CLOCK } from './records.service.js';

const BLOCKER_MESSAGES = {
  SIN_INGRESO: 'El infante no tiene ingreso registrado en esta jornada.',
  YA_SALIO: 'El infante ya tiene registrada su salida.',
} as const;

/**
 * Salida e incidencias del día (S-27). Todo se acota a la estancia activa;
 * los nombres de tutores y las descripciones nunca van a la bitácora.
 */
@Injectable()
export class DeparturesService {
  constructor(
    @Inject(ATTENDANCE_JOURNEYS_REPOSITORY) private readonly journeys: AttendanceJourneysRepository,
    @Inject(DEPARTURES_REPOSITORY) private readonly departures: DeparturesRepository,
    private readonly encryption: EncryptionService,
    private readonly audit: AuditService,
    @Inject(ATTENDANCE_CLOCK) private readonly clock: () => Date = () => new Date(),
  ) {}

  /** Quiénes pueden recoger hoy al infante: vinculados, vigentes en la fecha de la jornada, activos y autorizados. */
  async authorizedPickups(auth: AuthContext, journeyId: number, enrollmentId: number, request: RequestContext): Promise<AuthorizedPickup[]> {
    const journey = await this.requireJourney(auth, journeyId);
    const childId = await this.requireChild(journey, enrollmentId);
    const links = (await this.departures.listPickupLinks(childId)).filter((link) => isAuthorizedPickup(link, journey.date));
    await this.audit.record({ ...this.actor(auth), action: 'AUTORIZADOS_CONSULTADOS', tableName: 'inscripciones', recordId: String(enrollmentId), request });
    return links.map((link) => ({ id: link.guardianId, name: link.name, relationship: link.relationship }));
  }

  async registerDeparture(auth: AuthContext, journeyId: number, enrollmentId: number, input: RegisterDepartureRequest, request: RequestContext): Promise<RegisterDepartureResponse> {
    const journey = await this.requireOpenJourney(auth, journeyId);
    const childId = await this.requireChild(journey, enrollmentId);
    const record = await this.departures.findDayRecord(journey.id, enrollmentId);
    const blocker = departureBlocker(record);
    if (blocker !== null || record === null) throw new ApiError('CONFLICTO', BLOCKER_MESSAGES[blocker ?? 'SIN_INGRESO']);
    const link = (await this.departures.listPickupLinks(childId)).find((candidate) => candidate.guardianId === input.guardianId);
    if (!link || !isAuthorizedPickup(link, journey.date)) throw new ApiError('CONFLICTO', 'Esa persona no está autorizada para recoger al infante.');
    const at = this.clock();
    const saved = await this.departures.recordDeparture({ recordId: record.id, guardianId: input.guardianId, userId: auth.userId, at }, (tx, id) =>
      this.audit.record({ ...this.actor(auth), action: 'SALIDA_REGISTRADA', tableName: 'asistencias', recordId: String(id), after: { journeyId, enrollmentId, guardianId: input.guardianId, leftAt: at.toISOString() }, request }, tx),
    );
    if (!saved) throw new ApiError('CONFLICTO', BLOCKER_MESSAGES[departureBlocker(await this.departures.findDayRecord(journey.id, enrollmentId)) ?? 'YA_SALIO']);
    return { leftAt: at.toISOString() };
  }

  /** La descripción solo existe cifrada; la bitácora guarda el tipo, nunca el texto. */
  async registerIncident(auth: AuthContext, journeyId: number, enrollmentId: number, input: RegisterIncidentRequest, request: RequestContext): Promise<Incident> {
    const journey = await this.requireOpenJourney(auth, journeyId);
    const record = await this.requireEnteredRecord(journey, enrollmentId);
    const at = this.clock();
    const id = await this.departures.createIncident({ recordId: record.id, type: input.type, descriptionEncrypted: this.encryption.encrypt(input.description), userId: auth.userId, at }, (tx, incidentId) =>
      this.audit.record({ ...this.actor(auth), action: 'INCIDENCIA_REGISTRADA', tableName: 'incidencias_asistencia', recordId: String(incidentId), after: { attendanceRecordId: record.id, type: input.type }, request }, tx),
    );
    return { id, type: input.type, description: input.description, recordedAt: at.toISOString() };
  }

  /** Tipo y hora, sin la descripción: para quien consulta la asistencia. */
  async listIncidents(auth: AuthContext, journeyId: number, enrollmentId: number): Promise<Incident[]> {
    const { rows } = await this.incidentRows(auth, journeyId, enrollmentId);
    return rows.map((row) => this.toIncident(row, null));
  }

  /** Con la descripción descifrada: solo con permiso de notas sensibles, y la lectura se audita. */
  async listIncidentDetails(auth: AuthContext, journeyId: number, enrollmentId: number, request: RequestContext): Promise<Incident[]> {
    const { recordId, rows } = await this.incidentRows(auth, journeyId, enrollmentId);
    // Se audita sobre el registro de asistencia, con cuántas se leyeron: una lista de ids no cabe en la columna.
    if (rows.length > 0) {
      await this.audit.record({ ...this.actor(auth), action: 'INCIDENCIAS_CONSULTADAS', tableName: 'asistencias', recordId: String(recordId), after: { incidents: rows.length }, request });
    }
    return rows.map((row) => this.toIncident(row, row.descriptionEncrypted === null ? null : this.encryption.decrypt(row.descriptionEncrypted)));
  }

  private async incidentRows(auth: AuthContext, journeyId: number, enrollmentId: number): Promise<{ recordId: number | null; rows: IncidentRow[] }> {
    const journey = await this.requireJourney(auth, journeyId);
    await this.requireChild(journey, enrollmentId);
    const record = await this.departures.findDayRecord(journey.id, enrollmentId);
    return record === null ? { recordId: null, rows: [] } : { recordId: record.id, rows: await this.departures.listIncidents(record.id) };
  }

  private toIncident(row: IncidentRow, description: string | null): Incident {
    return { id: row.id, type: row.type, description, recordedAt: row.createdAt.toISOString() };
  }

  private async requireEnteredRecord(journey: AttendanceJourneyRecord, enrollmentId: number): Promise<DayRecordRow> {
    await this.requireChild(journey, enrollmentId);
    const record = await this.departures.findDayRecord(journey.id, enrollmentId);
    if (incidentBlocker(record) !== null || record === null) throw new ApiError('CONFLICTO', BLOCKER_MESSAGES.SIN_INGRESO);
    return record;
  }

  private async requireChild(journey: AttendanceJourneyRecord, enrollmentId: number): Promise<number> {
    const childId = await this.departures.findChildId(journey.estanciaId, enrollmentId);
    if (childId === null) throw new ApiError('NO_ENCONTRADO', 'El infante no está inscrito en esta estancia.');
    return childId;
  }

  private async requireOpenJourney(auth: AuthContext, journeyId: number): Promise<AttendanceJourneyRecord> {
    const journey = await this.requireJourney(auth, journeyId);
    if (journey.status === 'CERRADA') throw new ApiError('CONFLICTO', 'La jornada ya está cerrada.');
    if (journey.schoolYearArchived) throw new ApiError('CONFLICTO', 'El ciclo escolar de esa jornada está archivado: es de solo lectura.');
    return journey;
  }

  private async requireJourney(auth: AuthContext, journeyId: number): Promise<AttendanceJourneyRecord> {
    if (auth.activeEstanciaId === null) throw new ApiError('FUERA_DE_ALCANCE', 'Selecciona una estancia activa.');
    const journey = await this.journeys.findById(journeyId, auth.activeEstanciaId);
    if (!journey) throw new ApiError('NO_ENCONTRADO', 'Jornada no encontrada.');
    return journey;
  }

  private actor(auth: AuthContext): { userId: number; roleCode: string | null } {
    return { userId: auth.userId, roleCode: auth.principal.assignments.map((assignment) => assignment.role).sort().join(',') || null };
  }
}
