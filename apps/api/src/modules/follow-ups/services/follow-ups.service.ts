import { Inject, Injectable } from '@nestjs/common';
import type { FollowUp } from '@sirai/contracts';
import { AuditService } from '../../../common/audit/audit.service.js';
import type { AuthContext } from '../../../common/auth/auth-context.js';
import { ApiError } from '../../../common/errors/api-error.js';
import type { RequestContext } from '../../../common/http/request-context.js';
import type { FollowUpRow } from '../follow-ups.types.js';
import { FOLLOW_UPS_REPOSITORY, type FollowUpsRepository } from '../repositories/follow-ups.repository.js';

const toView = (row: FollowUpRow): FollowUp => ({ ...row, openedAt: row.openedAt.toISOString() });

@Injectable()
export class FollowUpsService {
  constructor(
    @Inject(FOLLOW_UPS_REPOSITORY) private readonly followUps: FollowUpsRepository,
    private readonly audit: AuditService,
  ) {}

  /** Bandeja de la estancia activa. Muestra nombres de menores: la lectura se audita. */
  async list(auth: AuthContext, request: RequestContext): Promise<FollowUp[]> {
    if (auth.activeEstanciaId === null) throw new ApiError('FUERA_DE_ALCANCE', 'Selecciona una estancia activa.');
    const rows = await this.followUps.listOpen(auth.activeEstanciaId);
    await this.audit.record({
      userId: auth.userId,
      roleCode: auth.principal.assignments.map((assignment) => assignment.role).sort().join(',') || null,
      action: 'SEGUIMIENTOS_CONSULTADOS',
      tableName: 'seguimientos',
      recordId: null,
      request,
    });
    return rows.map(toView);
  }
}
