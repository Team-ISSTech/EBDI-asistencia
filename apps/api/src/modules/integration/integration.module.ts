import { Module } from '@nestjs/common';
import { SYSTEM_RESOLVER } from '../../common/auth/auth-context';
import { PasswordHasher, Argon2PasswordHasher } from '../identity/services/password-hasher';
import { ReportsModule } from '../reports/reports.module';
import { IntegrationController } from './controllers/integration.controller';
import { SystemsAdminController } from './controllers/systems-admin.controller';
import { DrizzleSystemsRepository } from './repositories/drizzle-systems.repository';
import { SYSTEMS_REPOSITORY } from './repositories/systems.repository';
import { SystemRateLimiter } from './services/system-rate-limiter';
import { INTEGRATION_CLOCK, SystemTokenService } from './services/system-token.service';
import { SystemsAdminService } from './services/systems-admin.service';
import { TokenSigner } from './services/token-signer';

/** Sistemas externos y su API con Bearer token (RF-37). Exporta el resolutor que usa el guard global. */
@Module({
  imports: [ReportsModule],
  controllers: [SystemsAdminController, IntegrationController],
  providers: [
    { provide: SYSTEMS_REPOSITORY, useClass: DrizzleSystemsRepository },
    { provide: PasswordHasher, useClass: Argon2PasswordHasher },
    { provide: INTEGRATION_CLOCK, useValue: () => new Date() },
    TokenSigner,
    SystemRateLimiter,
    SystemTokenService,
    { provide: SYSTEM_RESOLVER, useExisting: SystemTokenService },
    SystemsAdminService,
  ],
  exports: [SYSTEM_RESOLVER],
})
export class IntegrationModule {}
