import { Module } from '@nestjs/common';
import { FollowUpsController } from './controllers/follow-ups.controller.js';
import { DrizzleFollowUpsRepository } from './repositories/drizzle-follow-ups.repository.js';
import { FOLLOW_UPS_REPOSITORY } from './repositories/follow-ups.repository.js';
import { FollowUpsGeneratorService } from './services/follow-ups-generator.service.js';
import { FollowUpsScheduler } from './services/follow-ups-scheduler.js';
import { FOLLOW_UPS_CLOCK, FollowUpsService } from './services/follow-ups.service.js';

@Module({
  controllers: [FollowUpsController],
  providers: [
    { provide: FOLLOW_UPS_REPOSITORY, useClass: DrizzleFollowUpsRepository },
    { provide: FOLLOW_UPS_CLOCK, useValue: () => new Date() },
    FollowUpsGeneratorService,
    FollowUpsScheduler,
    FollowUpsService,
  ],
  exports: [FollowUpsService],
})
export class FollowUpsModule {}
