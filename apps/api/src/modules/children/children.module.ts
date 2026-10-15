import { Module } from '@nestjs/common';
import { ChildrenController } from './controllers/children.controller';
import { ConsentsController } from './controllers/consents.controller';
import { GuardiansController } from './controllers/guardians.controller';
import { CHILDREN_REPOSITORY } from './repositories/children.repository';
import { CONSENTS_REPOSITORY } from './repositories/consents.repository';
import { DrizzleChildrenRepository } from './repositories/drizzle-children.repository';
import { DrizzleConsentsRepository } from './repositories/drizzle-consents.repository';
import { DrizzleGuardiansRepository } from './repositories/drizzle-guardians.repository';
import { GUARDIANS_REPOSITORY } from './repositories/guardians.repository';
import { CLOCK, ChildrenService } from './services/children.service';
import { ConsentsService } from './services/consents.service';
import { GuardiansService } from './services/guardians.service';

@Module({
  controllers: [ChildrenController, GuardiansController, ConsentsController],
  providers: [
    { provide: CHILDREN_REPOSITORY, useClass: DrizzleChildrenRepository },
    { provide: GUARDIANS_REPOSITORY, useClass: DrizzleGuardiansRepository },
    { provide: CONSENTS_REPOSITORY, useClass: DrizzleConsentsRepository },
    { provide: CLOCK, useValue: () => new Date() },
    ChildrenService,
    GuardiansService,
    ConsentsService,
  ],
})
export class ChildrenModule {}
