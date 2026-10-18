import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import type { ApiEnv } from '@sirai/config';
import { AuditModule } from './common/audit/audit.module';
import { AuthGuard } from './common/auth/auth.guard';
import { PermissionsGuard } from './common/auth/permissions.guard';
import { API_ENV, ConfigModule } from './common/config/config.module';
import { DatabaseModule } from './common/database/database.module';
import { ApiExceptionFilter } from './common/errors/api-exception.filter';
import { ChildrenModule } from './modules/children/children.module';
import { FollowUpsModule } from './modules/follow-ups/follow-ups.module';
import { DossiersModule } from './modules/dossiers/dossiers.module';
import { SyncModule } from './modules/sync/sync.module';
import { AuditQueryModule } from './modules/audit/audit.module';
import { AdministrationModule } from './modules/administration/administration.module';
import { HealthModule } from './modules/health/health.module';
import { ReportsModule } from './modules/reports/reports.module';
import { IdentityModule } from './modules/identity/identity.module';
import { AttendanceModule } from './modules/attendance/attendance.module';

const THROTTLE_WINDOW_MS = 60_000;

/**
 * Orden de guards: primero autenticación (carga la sesión), luego permisos.
 * El throttler se aplica solo donde se declara (`/auth/login`).
 */
@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    AuditModule,
    ThrottlerModule.forRootAsync({
      inject: [API_ENV],
      useFactory: (env: ApiEnv) => [{ ttl: THROTTLE_WINDOW_MS, limit: env.LOGIN_RATE_LIMIT_PER_MINUTE }],
    }),
    HealthModule,
    IdentityModule,
    ChildrenModule,
    AttendanceModule,
    FollowUpsModule,
    ReportsModule,
    DossiersModule,
    SyncModule,
    AdministrationModule,
    AuditQueryModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
