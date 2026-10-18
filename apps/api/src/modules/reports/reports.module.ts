import { Module } from '@nestjs/common';
import { ReportsController } from './controllers/reports.controller.js';
import { DrizzleReportsRepository } from './repositories/drizzle-reports.repository.js';
import { REPORTS_REPOSITORY } from './repositories/reports.repository.js';
import { DashboardService } from './services/dashboard.service.js';
import { REPORTS_CLOCK, ReportExportService } from './services/export.service.js';

@Module({
  controllers: [ReportsController],
  providers: [
    { provide: REPORTS_REPOSITORY, useClass: DrizzleReportsRepository },
    { provide: REPORTS_CLOCK, useValue: () => new Date() },
    DashboardService,
    ReportExportService,
  ],
  exports: [DashboardService],
})
export class ReportsModule {}
