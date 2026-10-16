import { Module } from '@nestjs/common';
import { FollowUpsController } from './controllers/follow-ups.controller.js';
import { DrizzleFollowUpsRepository } from './repositories/drizzle-follow-ups.repository.js';
import { FOLLOW_UPS_REPOSITORY } from './repositories/follow-ups.repository.js';
import { FollowUpsGeneratorService } from './services/follow-ups-generator.service.js';
import { FollowUpsScheduler } from './services/follow-ups-scheduler.js';
import { FollowUpsService } from './services/follow-ups.service.js';

@Module({
  controllers: [FollowUpsController],
  providers: [
    { provide: FOLLOW_UPS_REPOSITORY, useClass: DrizzleFollowUpsRepository },
    FollowUpsGeneratorService,
    FollowUpsScheduler,
    FollowUpsService,
  ],
})
export class FollowUpsModule {}
