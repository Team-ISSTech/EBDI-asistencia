import { Module } from '@nestjs/common';
import { DossiersController } from './controllers/dossiers.controller.js';
import { DOSSIERS_REPOSITORY } from './repositories/dossiers.repository.js';
import { DrizzleDossiersRepository } from './repositories/drizzle-dossiers.repository.js';
import { DOSSIERS_CLOCK, DOSSIER_PDF_OPTIONS, DossierService } from './services/dossier.service.js';

@Module({
  controllers: [DossiersController],
  providers: [
    { provide: DOSSIERS_REPOSITORY, useClass: DrizzleDossiersRepository },
    { provide: DOSSIERS_CLOCK, useValue: () => new Date() },
    { provide: DOSSIER_PDF_OPTIONS, useValue: {} },
    DossierService,
  ],
})
export class DossiersModule {}
