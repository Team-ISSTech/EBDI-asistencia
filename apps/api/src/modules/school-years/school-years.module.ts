import { Module } from '@nestjs/common';
import { SchoolYearsController } from './controllers/school-years.controller';
import { DrizzleSchoolYearsRepository } from './repositories/drizzle-school-years.repository';
import { SCHOOL_YEARS_REPOSITORY } from './repositories/school-years.repository';
import { SCHOOL_YEARS_CLOCK, SchoolYearsService } from './services/school-years.service';

@Module({
  controllers: [SchoolYearsController],
  providers: [
    { provide: SCHOOL_YEARS_REPOSITORY, useClass: DrizzleSchoolYearsRepository },
    { provide: SCHOOL_YEARS_CLOCK, useValue: () => new Date() },
    SchoolYearsService,
  ],
})
export class SchoolYearsModule {}
