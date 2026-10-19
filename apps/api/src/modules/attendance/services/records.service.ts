import { Inject, Injectable } from '@nestjs/common';
import type { MarkAttendanceRequest, MarkAttendanceResponse, RosterEntry, SyncRejection } from '@sirai/contracts';
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

/** Resultado de una captura sin conexión: se aplicó lo válido y cada rechazo lleva su infante y su motivo. */
export interface PartialMarkResult {
  readonly saved: number;
  readonly unchanged: number;
  readonly rejections: readonly SyncRejection[];
}

const REJECTION_MESSAGES = {
  INSCRIPCION_INVALIDA: 'El infante no está inscrito en esta estancia.',
  TURNO_DISTINTO: 'El infante es de una sala de otro turno.',
  CANDADO_MEDICO: 'El infante requiere alta médica para ingresar; no se puede marcar presente.',
} as const;

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
    await this.assertNoMedicalLock(journey.estanciaId, input);
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

  /**
   * Captura hecha sin conexión: aplica lo que sea válido y devuelve cada
   * rechazo, en vez de tumbar todo el lote. Se registra con la hora en que se
   * capturó (nunca en el futuro). Una jornada que se cerró después de la
   * captura todavía la acepta, para no perder datos; si se cerró antes, la
   * rechaza completa y quien capturó debe reconciliarla.
   */
  async markPartial(auth: AuthContext, journeyId: number, input: MarkAttendanceRequest, capturedAt: Date, request: RequestContext): Promise<PartialMarkResult> {
    const journey = await this.requireJourney(auth, journeyId);
    if (journey.schoolYearArchived) throw new ApiError('CONFLICTO', 'El ciclo escolar de esa jornada está archivado: es de solo lectura y no admite capturas.');
    if (journey.status === 'CERRADA' && (journey.closedAt === null || capturedAt > journey.closedAt)) {
      throw new ApiError('CONFLICTO', 'La jornada ya estaba cerrada cuando se capturó.');
    }
    const at = new Date(Math.min(capturedAt.getTime(), this.clock().getTime()));
    const { valid, rejections } = await this.splitValid(journey, input);
    const changes = valid.marks.length === 0 ? [] : await this.planChanges(journey.id, valid);
    if (changes.length > 0) {
      await this.records.applyChanges(journey.id, auth.userId, at, changes, (tx, change, recordId) =>
        this.audit.record(
          {
            ...this.actor(auth),
            action: change.plan === 'CREATE' ? 'ASISTENCIA_REGISTRADA' : 'ASISTENCIA_MODIFICADA',
            tableName: RECORDS_TABLE,
            recordId: String(recordId),
            ...(change.before === null ? {} : { before: { status: change.before } }),
            after: { journeyId: journey.id, enrollmentId: change.enrollmentId, status: change.status, method: change.method, capturedAt: at.toISOString() },
            request,
          },
          tx,
        ),
      );
    }
    return { saved: changes.length, unchanged: valid.marks.length - changes.length, rejections };
  }

  /** Separa las marcas que se pueden aplicar de las que no, con el motivo de cada una. */
  private async splitValid(journey: AttendanceJourneyRecord, input: MarkAttendanceRequest): Promise<{ valid: MarkAttendanceRequest; rejections: SyncRejection[] }> {
    const ids = input.marks.map((mark) => mark.enrollmentId);
    const enrollments = new Map((await this.records.findEnrollments(journey.estanciaId, ids)).map((enrollment) => [enrollment.enrollmentId, enrollment]));
    const presentIds = input.marks.filter((mark) => mark.status === 'PRESENTE' && enrollments.has(mark.enrollmentId)).map((mark) => mark.enrollmentId);
    const locked = presentIds.length === 0 ? new Set<number>() : await this.records.findLockedEnrollmentIds(journey.estanciaId, presentIds);
    const rejections: SyncRejection[] = [];
    const marks = input.marks.filter((mark) => {
      const code = this.rejectionCode(journey, enrollments.get(mark.enrollmentId), mark.status === 'PRESENTE' && locked.has(mark.enrollmentId));
      if (code) rejections.push({ ref: mark.enrollmentId, code, message: REJECTION_MESSAGES[code] });
      return code === null;
    });
    return { valid: { marks }, rejections };
  }

  private rejectionCode(journey: AttendanceJourneyRecord, enrollment: EnrollmentForMarking | undefined, locked: boolean): keyof typeof REJECTION_MESSAGES | null {
    if (!enrollment) return 'INSCRIPCION_INVALIDA';
    if (enrollment.roomShift !== journey.shift) return 'TURNO_DISTINTO';
    return locked ? 'CANDADO_MEDICO' : null;
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

  /** RF-29: con candado médico activo no se puede marcar Presente; otros estados (ausencia, comisión médica) sí. */
  private async assertNoMedicalLock(estanciaId: number, input: MarkAttendanceRequest): Promise<void> {
    const presentIds = input.marks.filter((mark) => mark.status === 'PRESENTE').map((mark) => mark.enrollmentId);
    if (presentIds.length === 0) return;
    const locked = await this.records.findLockedEnrollmentIds(estanciaId, presentIds);
    if (locked.size > 0) throw new ApiError('CONFLICTO', 'Hay infantes que requieren alta médica para ingresar: no se pueden marcar presentes hasta que el médico la registre.');
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
