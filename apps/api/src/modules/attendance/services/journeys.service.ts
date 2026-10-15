import { Inject, Injectable } from '@nestjs/common';
import type { AttendanceJourney, AttendanceJourneyQuery, OpenAttendanceJourneyRequest } from '@sirai/contracts';
import { AuditService } from '../../../common/audit/audit.service.js';
import type { AuthContext } from '../../../common/auth/auth-context.js';
import { ApiError } from '../../../common/errors/api-error.js';
import type { RequestContext } from '../../../common/http/request-context.js';
import type { AttendanceJourneyRecord } from '../attendance.types.js';
import { ATTENDANCE_JOURNEYS_REPOSITORY, type AttendanceJourneysRepository } from '../repositories/repositories.js';

const JOURNEYS_TABLE = 'jornadas_asistencia';

const toView = (record: AttendanceJourneyRecord): AttendanceJourney => ({
  id: record.id,
  estanciaId: record.estanciaId,
  date: record.date,
  shift: record.shift,
  status: record.status,
  openedAt: record.openedAt.toISOString(),
  closedAt: record.closedAt?.toISOString() ?? null,
} as AttendanceJourney);

@Injectable()
export class JourneysService {
  constructor(
    @Inject(ATTENDANCE_JOURNEYS_REPOSITORY) private readonly journeys: AttendanceJourneysRepository,
    private readonly audit: AuditService,
  ) {}

  async open(auth: AuthContext, input: OpenAttendanceJourneyRequest, request: RequestContext): Promise<AttendanceJourney> {
    const estanciaId = this.requireActiveEstancia(auth);
    if (await this.journeys.findByKey(estanciaId, input.date, input.shift)) {
      throw new ApiError('CONFLICTO', 'Ya existe una jornada para esa estancia, fecha y turno.');
    }
    const openedAt = new Date();
    const record = await this.journeys.create(
      { estanciaId, date: input.date, shift: input.shift, openedAt, openedBy: auth.userId },
      (tx, id) => this.audit.record({ ...this.actor(auth), action: 'JORNADA_ABIERTA', tableName: JOURNEYS_TABLE, recordId: String(id), after: input, request }, tx),
    );
    return toView(record);
  }

  async close(auth: AuthContext, id: number, request: RequestContext): Promise<AttendanceJourney> {
    const estanciaId = this.requireActiveEstancia(auth);
    const current = await this.journeys.findById(id, estanciaId);
    if (!current) throw new ApiError('NO_ENCONTRADO', 'Jornada no encontrada.');
    if (current.status === 'CERRADA') throw new ApiError('CONFLICTO', 'La jornada ya está cerrada.');
    const record = await this.journeys.close(id, estanciaId, auth.userId, new Date(), (tx) =>
      this.audit.record({ ...this.actor(auth), action: 'JORNADA_CERRADA', tableName: JOURNEYS_TABLE, recordId: String(id), before: { status: current.status }, after: { status: 'CERRADA' }, request }, tx),
    );
    if (!record) throw new ApiError('CONFLICTO', 'La jornada cambió de estado; actualiza la pantalla e intenta de nuevo.');
    return toView(record);
  }

  async find(auth: AuthContext, query: AttendanceJourneyQuery): Promise<AttendanceJourney> {
    const estanciaId = this.requireActiveEstancia(auth);
    const record = await this.journeys.findByKey(estanciaId, query.date, query.shift);
    if (!record || record.status !== 'ABIERTA') throw new ApiError('NO_ENCONTRADO', 'No hay una jornada abierta para esa fecha y turno.');
    return toView(record);
  }

  private requireActiveEstancia(auth: AuthContext): number {
    if (auth.activeEstanciaId === null) throw new ApiError('FUERA_DE_ALCANCE', 'Selecciona una estancia activa.');
    return auth.activeEstanciaId;
  }

  private actor(auth: AuthContext): { userId: number; roleCode: string | null } {
    return { userId: auth.userId, roleCode: auth.principal.assignments.map((assignment) => assignment.role).sort().join(',') || null };
  }
}
