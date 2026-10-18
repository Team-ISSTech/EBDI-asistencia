import { Inject, Injectable } from '@nestjs/common';
import { schema, type Db } from '@sirai/db';
import { and, asc, desc, eq, gte, lt, lte } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module';
import type { AuditFacets, AuditFilters, AuditRow } from '../audit-query.types';
import type { AuditQueryRepository } from './audit-query.repository';

const { auditoria, usuarios, integrationSystems } = schema;

const conditions = (filters: AuditFilters) => [
  filters.from === undefined ? undefined : gte(auditoria.occurredAt, filters.from),
  filters.to === undefined ? undefined : lte(auditoria.occurredAt, filters.to),
  filters.userId === undefined ? undefined : eq(auditoria.userId, filters.userId),
  filters.action === undefined ? undefined : eq(auditoria.action, filters.action),
  filters.table === undefined ? undefined : eq(auditoria.tableName, filters.table),
  filters.recordId === undefined ? undefined : eq(auditoria.recordId, filters.recordId),
  filters.beforeId === undefined ? undefined : lt(auditoria.id, filters.beforeId),
];

@Injectable()
export class DrizzleAuditQueryRepository implements AuditQueryRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async list(filters: AuditFilters, limit: number): Promise<AuditRow[]> {
    return this.db
      .select({
        id: auditoria.id,
        occurredAt: auditoria.occurredAt,
        userId: auditoria.userId,
        userName: usuarios.name,
        systemName: integrationSystems.name,
        roleCode: auditoria.roleCode,
        action: auditoria.action,
        tableName: auditoria.tableName,
        recordId: auditoria.recordId,
        ipAddress: auditoria.ipAddress,
        userAgent: auditoria.userAgent,
        previousDataEncrypted: auditoria.previousDataEncrypted,
        newDataEncrypted: auditoria.newDataEncrypted,
      })
      .from(auditoria)
      .leftJoin(usuarios, eq(usuarios.id, auditoria.userId))
      .leftJoin(integrationSystems, eq(integrationSystems.id, auditoria.systemId))
      .where(and(...conditions(filters)))
      .orderBy(desc(auditoria.id))
      .limit(limit);
  }

  async facets(): Promise<AuditFacets> {
    const actions = await this.db.selectDistinct({ value: auditoria.action }).from(auditoria).orderBy(asc(auditoria.action));
    const tables = await this.db.selectDistinct({ value: auditoria.tableName }).from(auditoria).orderBy(asc(auditoria.tableName));
    return { actions: actions.map((row) => row.value), tables: tables.map((row) => row.value) };
  }
}
