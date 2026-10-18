import { Inject, Injectable } from '@nestjs/common';
import type { AuditFiltersResponse, AuditListResponse, AuditQuery } from '@sirai/contracts';
import { changedFieldNames } from '@sirai/domain';
import { AuditService } from '../../../common/audit/audit.service';
import type { AuthContext } from '../../../common/auth/auth-context';
import { EncryptionService } from '../../../common/crypto/encryption.service';
import { type RequestContext, unpackIp } from '../../../common/http/request-context';
import { rolesSummary } from '../../identity/services/session-response';
import type { AuditFilters, AuditRow } from '../audit-query.types';
import { AUDIT_QUERY_REPOSITORY, type AuditQueryRepository } from '../repositories/audit-query.repository';

const AUDIT_TABLE = 'auditoria';

const toFilters = (query: AuditQuery): AuditFilters => ({
  ...(query.from === undefined ? {} : { from: new Date(query.from) }),
  ...(query.to === undefined ? {} : { to: new Date(query.to) }),
  ...(query.userId === undefined ? {} : { userId: query.userId }),
  ...(query.action === undefined ? {} : { action: query.action }),
  ...(query.table === undefined ? {} : { table: query.table }),
  ...(query.recordId === undefined ? {} : { recordId: query.recordId }),
  ...(query.beforeId === undefined ? {} : { beforeId: query.beforeId }),
});

/**
 * Consulta de la bitácora (RF-11) para quien la audita. Del cambio solo salen los
 * nombres de los campos: los valores pueden ser datos de menores y el rol que
 * consulta no accede a ellos. Los descifra el servidor solo para sacar esos
 * nombres y los descarta.
 */
@Injectable()
export class AuditQueryService {
  constructor(
    @Inject(AUDIT_QUERY_REPOSITORY) private readonly rows: AuditQueryRepository,
    private readonly encryption: EncryptionService,
    private readonly audit: AuditService,
  ) {}

  async list(auth: AuthContext, query: AuditQuery, request: RequestContext): Promise<AuditListResponse> {
    const found = await this.rows.list(toFilters(query), query.limit + 1);
    const page = found.slice(0, query.limit);
    const last = page.at(-1);
    await this.audit.record({
      userId: auth.userId,
      roleCode: rolesSummary(auth.principal.assignments),
      action: 'AUDITORIA_CONSULTADA',
      tableName: AUDIT_TABLE,
      recordId: null,
      request,
    });
    return { entries: page.map((row) => this.toEntry(row)), nextBeforeId: found.length > query.limit && last ? last.id : null };
  }

  filters(): Promise<AuditFiltersResponse> {
    return this.rows.facets();
  }

  private toEntry(row: AuditRow): AuditListResponse['entries'][number] {
    return {
      id: row.id,
      occurredAt: row.occurredAt.toISOString(),
      userId: row.userId,
      userName: row.userName,
      roleCode: row.roleCode,
      action: row.action,
      tableName: row.tableName,
      recordId: row.recordId,
      ipAddress: unpackIp(row.ipAddress),
      userAgent: row.userAgent,
      changedFields: changedFieldNames(this.encryption.decryptJson(row.previousDataEncrypted), this.encryption.decryptJson(row.newDataEncrypted)),
    };
  }
}
