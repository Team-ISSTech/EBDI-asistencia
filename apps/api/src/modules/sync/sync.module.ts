import { Module } from '@nestjs/common';
import { AttendanceModule } from '../attendance/attendance.module.js';
import { FollowUpsModule } from '../follow-ups/follow-ups.module.js';
import { SyncController } from './controllers/sync.controller.js';
import { DrizzleSyncRepository } from './repositories/drizzle-sync.repository.js';
import { SYNC_REPOSITORY } from './repositories/sync.repository.js';
import { SyncService } from './services/sync.service.js';

@Module({
  imports: [AttendanceModule, FollowUpsModule],
  controllers: [SyncController],
  providers: [{ provide: SYNC_REPOSITORY, useClass: DrizzleSyncRepository }, SyncService],
})
export class SyncModule {}
