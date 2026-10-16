import { Module } from '@nestjs/common';
import { JourneysController } from './controllers/journeys.controller.js';
import { RecordsController } from './controllers/records.controller.js';
import { DrizzleAttendanceJourneysRepository } from './repositories/drizzle-attendance-journeys.repository.js';
import { DrizzleAttendanceRecordsRepository } from './repositories/drizzle-attendance-records.repository.js';
import { ATTENDANCE_RECORDS_REPOSITORY } from './repositories/records.repository.js';
import { ATTENDANCE_JOURNEYS_REPOSITORY } from './repositories/repositories.js';
import { JourneysService } from './services/journeys.service.js';
import { ATTENDANCE_CLOCK, AttendanceRecordsService } from './services/records.service.js';

@Module({
  controllers: [JourneysController, RecordsController],
  providers: [
    { provide: ATTENDANCE_JOURNEYS_REPOSITORY, useClass: DrizzleAttendanceJourneysRepository },
    { provide: ATTENDANCE_RECORDS_REPOSITORY, useClass: DrizzleAttendanceRecordsRepository },
    { provide: ATTENDANCE_CLOCK, useValue: () => new Date() },
    JourneysService,
    AttendanceRecordsService,
  ],
})
export class AttendanceModule {}
