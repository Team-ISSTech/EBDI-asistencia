import { Inject, Injectable } from '@nestjs/common';
import type { MarkAttendanceRequest, MarkAttendanceResponse, RosterEntry } from '@sirai/contracts';
import { planMark } from '@sirai/domain';
import { AuditService } from '../../../common/audit/audit.service.js';
import type { AuthContext } from '../../../common/auth/auth-context.js';
import { ApiError } from '../../../common/errors/api-error.js';
import type { RequestContext } from '../../../common/http/request-context.js';
import type { AttendanceJourneyRecord } from '../attendance.types.js';
import { ATTENDANCE_RECORDS_REPOSITORY, type AttendanceRecordsRepository } from '../repositories/records.repository.js';
import { ATTENDANCE_JOURNEYS_REPOSITORY, type AttendanceJourneysRepository } from '../repositories/repositories.js';
import type { EnrollmentForMarking, ExistingMark, MarkChange } from '../records.types.js';

const RECORDS_TABLE = 'asistencias';
const JOURNEYS_TABLE = 'jornadas_asistencia';

export const ATTENDANCE_CLOCK = Symbol('ATTENDANCE_CLOCK');

/**
 * Pase de lista: la lista de la jornada y el registro de asistencia por lote.
 * Todo se acota a la estancia activa y exige una jornada abierta.
 */
@Injectable()
export class AttendanceRecordsService {
  constructor(
    @Inject(ATTENDANCE_JOURNEYS_REPOSITORY) private readonly journeys: AttendanceJourneysRepository,
    @Inject(ATTENDANCE_RECORDS_REPOSITORY) private readonly records: AttendanceRecordsRepository,
    private readonly audit: AuditService,
    @Inject(ATTENDANCE_CLOCK) private readonly clock: () => Date = () => new Date(),
  ) {}

  /** La lista de una jornada muestra nombres de menores: la lectura se audita. */
  async roster(auth: AuthContext, journeyId: number, request: RequestContext): Promise<RosterEntry[]> {
    const journey = await this.requireJourney(auth, journeyId);
    const rows = await this.records.listRoster(journey.estanciaId, journey.id, journey.shift);
    await this.audit.record({ ...this.actor(auth), action: 'LISTA_ASISTENCIA_CONSULTADA', tableName: JOURNEYS_TABLE, recordId: String(journeyId), request });
    return rows.map((row) => ({ ...row }));
  }

  /**
   * Aplica el lote completo o nada. Un reintento (misma operación) o un estado
   * que ya está registrado no cambia ni audita nada; solo lo nuevo se escribe.
   */
  async mark(auth: AuthContext, journeyId: number, input: MarkAttendanceRequest, request: RequestContext): Promise<MarkAttendanceResponse> {
    const journey = await this.requireJourney(auth, journeyId);
    if (journey.status === 'CERRADA') throw new ApiError('CONFLICTO', 'La jornada ya está cerrada.');
    const enrollmentIds = input.marks.map((mark) => mark.enrollmentId);
    this.assertEnrollable(journey, enrollmentIds, await this.records.findEnrollments(journey.estanciaId, enrollmentIds));
    const changes = await this.planChanges(journey.id, input);
    if (changes.length > 0) {
      await this.records.applyChanges(journey.id, auth.userId, this.clock(), changes, (tx, change, recordId) =>
        this.audit.record(
          {
            ...this.actor(auth),
            action: change.plan === 'CREATE' ? 'ASISTENCIA_REGISTRADA' : 'ASISTENCIA_MODIFICADA',
            tableName: RECORDS_TABLE,
            recordId: String(recordId),
            ...(change.before === null ? {} : { before: { status: change.before } }),
            after: { journeyId: journey.id, enrollmentId: change.enrollmentId, status: change.status, method: change.method },
            request,
          },
          tx,
        ),
      );
    }
    return { saved: changes.length, unchanged: input.marks.length - changes.length };
  }

  private async planChanges(journeyId: number, input: MarkAttendanceRequest): Promise<MarkChange[]> {
    const applied = await this.records.findAppliedClientIds(input.marks.map((mark) => mark.clientId));
    const existing = new Map((await this.records.findMarks(journeyId, input.marks.map((mark) => mark.enrollmentId))).map((mark: ExistingMark) => [mark.enrollmentId, mark]));
    return input.marks.flatMap((mark) => {
      if (applied.has(mark.clientId)) return [];
      const before = existing.get(mark.enrollmentId) ?? null;
      const plan = planMark(before, mark.status);
      return plan === 'UNCHANGED'
        ? []
        : [{ plan, enrollmentId: mark.enrollmentId, status: mark.status, clientId: mark.clientId, method: mark.method, before: before?.status ?? null }];
    });
  }

  /** Todos deben estar inscritos y activos en la estancia, y en una sala del turno de la jornada. */
  private assertEnrollable(journey: AttendanceJourneyRecord, requested: readonly number[], found: readonly EnrollmentForMarking[]): void {
    if (found.length !== requested.length) throw new ApiError('DATOS_INVALIDOS', 'Hay infantes que no están inscritos en esta estancia.');
    if (found.some((enrollment) => enrollment.roomShift !== journey.shift)) {
      throw new ApiError('DATOS_INVALIDOS', 'Hay infantes de una sala de otro turno.');
    }
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
