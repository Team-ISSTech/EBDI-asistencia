import { Module } from '@nestjs/common';
import { AuditController } from './controllers/audit.controller';
import { AUDIT_QUERY_REPOSITORY } from './repositories/audit-query.repository';
import { DrizzleAuditQueryRepository } from './repositories/drizzle-audit-query.repository';
import { AuditQueryService } from './services/audit-query.service';

@Module({
  controllers: [AuditController],
  providers: [{ provide: AUDIT_QUERY_REPOSITORY, useClass: DrizzleAuditQueryRepository }, AuditQueryService],
})
export class AuditQueryModule {}
