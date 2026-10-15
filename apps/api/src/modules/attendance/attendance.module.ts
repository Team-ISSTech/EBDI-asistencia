import { Module } from '@nestjs/common';
import { JourneysController } from './controllers/journeys.controller.js';
import { DrizzleAttendanceJourneysRepository } from './repositories/drizzle-attendance-journeys.repository.js';
import { ATTENDANCE_JOURNEYS_REPOSITORY } from './repositories/repositories.js';
import { JourneysService } from './services/journeys.service.js';

@Module({
  controllers: [JourneysController],
  providers: [
    { provide: ATTENDANCE_JOURNEYS_REPOSITORY, useClass: DrizzleAttendanceJourneysRepository },
    JourneysService,
  ],
})
export class AttendanceModule {}
