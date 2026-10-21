import { Module } from '@nestjs/common';
import { DeparturesController } from './controllers/departures.controller.js';
import { JourneysController } from './controllers/journeys.controller.js';
import { RecordsController } from './controllers/records.controller.js';
import { DrizzleAttendanceJourneysRepository } from './repositories/drizzle-attendance-journeys.repository.js';
import { DrizzleAttendanceRecordsRepository } from './repositories/drizzle-attendance-records.repository.js';
import { DrizzleDeparturesRepository } from './repositories/drizzle-departures.repository.js';
import { DEPARTURES_REPOSITORY } from './repositories/departures.repository.js';
import { ATTENDANCE_RECORDS_REPOSITORY } from './repositories/records.repository.js';
import { ATTENDANCE_JOURNEYS_REPOSITORY } from './repositories/repositories.js';
import { DeparturesService } from './services/departures.service.js';
import { JourneysService } from './services/journeys.service.js';
import { ATTENDANCE_CLOCK, AttendanceRecordsService } from './services/records.service.js';

@Module({
  controllers: [JourneysController, RecordsController, DeparturesController],
  providers: [
    { provide: ATTENDANCE_JOURNEYS_REPOSITORY, useClass: DrizzleAttendanceJourneysRepository },
    { provide: ATTENDANCE_RECORDS_REPOSITORY, useClass: DrizzleAttendanceRecordsRepository },
    { provide: DEPARTURES_REPOSITORY, useClass: DrizzleDeparturesRepository },
    { provide: ATTENDANCE_CLOCK, useValue: () => new Date() },
    JourneysService,
    AttendanceRecordsService,
    DeparturesService,
  ],
  exports: [AttendanceRecordsService],
})
export class AttendanceModule {}
