import { Module } from '@nestjs/common';
import { ChildrenController } from './controllers/children.controller';
import { GuardiansController } from './controllers/guardians.controller';
import { CHILDREN_REPOSITORY } from './repositories/children.repository';
import { DrizzleChildrenRepository } from './repositories/drizzle-children.repository';
import { DrizzleGuardiansRepository } from './repositories/drizzle-guardians.repository';
import { GUARDIANS_REPOSITORY } from './repositories/guardians.repository';
import { CLOCK, ChildrenService } from './services/children.service';
import { GuardiansService } from './services/guardians.service';

@Module({
  controllers: [ChildrenController, GuardiansController],
  providers: [
    { provide: CHILDREN_REPOSITORY, useClass: DrizzleChildrenRepository },
    { provide: GUARDIANS_REPOSITORY, useClass: DrizzleGuardiansRepository },
    { provide: CLOCK, useValue: () => new Date() },
    ChildrenService,
    GuardiansService,
  ],
})
export class ChildrenModule {}
