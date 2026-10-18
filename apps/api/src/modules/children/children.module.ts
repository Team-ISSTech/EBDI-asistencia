import { Module } from '@nestjs/common';
import { ChildrenController } from './controllers/children.controller';
import { ConsentsController } from './controllers/consents.controller';
import { EnrollmentMovementsController } from './controllers/enrollment-movements.controller';
import { GuardiansController } from './controllers/guardians.controller';
import { CHILDREN_REPOSITORY } from './repositories/children.repository';
import { CONSENTS_REPOSITORY } from './repositories/consents.repository';
import { DrizzleChildrenRepository } from './repositories/drizzle-children.repository';
import { DrizzleConsentsRepository } from './repositories/drizzle-consents.repository';
import { DrizzleEnrollmentsRepository } from './repositories/drizzle-enrollments.repository';
import { DrizzleGuardiansRepository } from './repositories/drizzle-guardians.repository';
import { ENROLLMENTS_REPOSITORY } from './repositories/enrollments.repository';
import { GUARDIANS_REPOSITORY } from './repositories/guardians.repository';
import { CLOCK, ChildrenService } from './services/children.service';
import { ConsentsService } from './services/consents.service';
import { EnrollmentMovementsService } from './services/enrollment-movements.service';
import { GuardiansService } from './services/guardians.service';

@Module({
  controllers: [ChildrenController, GuardiansController, ConsentsController, EnrollmentMovementsController],
  providers: [
    { provide: CHILDREN_REPOSITORY, useClass: DrizzleChildrenRepository },
    { provide: GUARDIANS_REPOSITORY, useClass: DrizzleGuardiansRepository },
    { provide: CONSENTS_REPOSITORY, useClass: DrizzleConsentsRepository },
    { provide: ENROLLMENTS_REPOSITORY, useClass: DrizzleEnrollmentsRepository },
    { provide: CLOCK, useValue: () => new Date() },
    ChildrenService,
    GuardiansService,
    ConsentsService,
    EnrollmentMovementsService,
  ],
})
export class ChildrenModule {}
