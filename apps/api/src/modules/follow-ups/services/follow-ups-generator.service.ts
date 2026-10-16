import { Inject, Injectable } from '@nestjs/common';
import { cutoffReached } from '@sirai/domain';
import { AuditService } from '../../../common/audit/audit.service.js';
import type { RequestContext } from '../../../common/http/request-context.js';
import { FOLLOW_UPS_REPOSITORY, type FollowUpsRepository } from '../repositories/follow-ups.repository.js';

const FOLLOW_UPS_TABLE = 'seguimientos';
const LOOKBACK_DAYS = 7;
const MS_PER_DAY = 86_400_000;
const SYSTEM_ROLE = 'SISTEMA';
const JOB_REQUEST: RequestContext = { ip: null, userAgent: 'job:seguimientos', requestId: null };

/**
 * RF-24: al cierre de las 09:00 de cada estancia, cada ausencia genera su
 * ticket. Es repetible: el ticket es único por registro de asistencia, así
 * que correr de nuevo (o desde varias instancias de la API) no duplica nada.
 */
@Injectable()
export class FollowUpsGeneratorService {
  constructor(
    @Inject(FOLLOW_UPS_REPOSITORY) private readonly followUps: FollowUpsRepository,
    private readonly audit: AuditService,
  ) {}

  async generateDue(now: Date): Promise<number> {
    const since = new Date(now.getTime() - LOOKBACK_DAYS * MS_PER_DAY).toISOString().slice(0, 10);
    const candidates = await this.followUps.findAbsencesWithoutTicket(since);
    const due = candidates.filter((candidate) => cutoffReached(now, candidate.timeZone, candidate.journeyDate));
    if (due.length === 0) return 0;
    return this.followUps.openTickets(due, now, (tx, candidate, ticketId) =>
      this.audit.record(
        {
          userId: null,
          roleCode: SYSTEM_ROLE,
          action: 'SEGUIMIENTO_ABIERTO',
          tableName: FOLLOW_UPS_TABLE,
          recordId: String(ticketId),
          after: { attendanceRecordId: candidate.recordId, estanciaId: candidate.estanciaId, journeyDate: candidate.journeyDate },
          request: JOB_REQUEST,
        },
        tx,
      ),
    );
  }
}
