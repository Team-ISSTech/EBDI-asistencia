import { Module } from '@nestjs/common';
import { EstanciasAdminController, RoomsAdminController } from './controllers/administration.controller';
import { DrizzleEstanciasAdminRepository } from './repositories/drizzle-estancias-admin.repository';
import { DrizzleRoomsAdminRepository } from './repositories/drizzle-rooms-admin.repository';
import { ESTANCIAS_ADMIN_REPOSITORY } from './repositories/estancias-admin.repository';
import { ROOMS_ADMIN_REPOSITORY } from './repositories/rooms-admin.repository';
import { ADMIN_CLOCK, EstanciasAdminService } from './services/estancias-admin.service';
import { RoomsAdminService } from './services/rooms-admin.service';

@Module({
  controllers: [EstanciasAdminController, RoomsAdminController],
  providers: [
    { provide: ESTANCIAS_ADMIN_REPOSITORY, useClass: DrizzleEstanciasAdminRepository },
    { provide: ROOMS_ADMIN_REPOSITORY, useClass: DrizzleRoomsAdminRepository },
    { provide: ADMIN_CLOCK, useValue: () => new Date() },
    EstanciasAdminService,
    RoomsAdminService,
  ],
})
export class AdministrationModule {}
