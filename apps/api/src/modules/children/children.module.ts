import { Module } from '@nestjs/common';
import { ChildrenController } from './controllers/children.controller';
import { CHILDREN_REPOSITORY } from './repositories/children.repository';
import { DrizzleChildrenRepository } from './repositories/drizzle-children.repository';
import { CLOCK, ChildrenService } from './services/children.service';

@Module({
  controllers: [ChildrenController],
  providers: [
    { provide: CHILDREN_REPOSITORY, useClass: DrizzleChildrenRepository },
    { provide: CLOCK, useValue: () => new Date() },
    ChildrenService,
  ],
})
export class ChildrenModule {}
