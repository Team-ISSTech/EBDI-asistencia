import { EstanciasAdminController, RoomsAdminController } from '../../modules/administration/controllers/administration.controller';
import { DeparturesController } from '../../modules/attendance/controllers/departures.controller';
import { JourneysController } from '../../modules/attendance/controllers/journeys.controller';
import { RecordsController } from '../../modules/attendance/controllers/records.controller';
import { AuditController } from '../../modules/audit/controllers/audit.controller';
import { ChildrenController } from '../../modules/children/controllers/children.controller';
import { ConsentsController } from '../../modules/children/controllers/consents.controller';
import { EnrollmentMovementsController } from '../../modules/children/controllers/enrollment-movements.controller';
import { GuardiansController } from '../../modules/children/controllers/guardians.controller';
import { DossiersController } from '../../modules/dossiers/controllers/dossiers.controller';
import { FollowUpsController } from '../../modules/follow-ups/controllers/follow-ups.controller';
import { HealthController } from '../../modules/health/health.controller';
import { AuthController } from '../../modules/identity/controllers/auth.controller';
import { UsersController } from '../../modules/identity/controllers/users.controller';
import { IntegrationController } from '../../modules/integration/controllers/integration.controller';
import { SystemsAdminController } from '../../modules/integration/controllers/systems-admin.controller';
import { ReportsController } from '../../modules/reports/controllers/reports.controller';
import { SchoolYearsController } from '../../modules/school-years/controllers/school-years.controller';
import { SyncController } from '../../modules/sync/controllers/sync.controller';

/** Todos los controladores de la API. `route-authorization.test.ts` comprueba que no falte ninguno. */
export const ALL_CONTROLLERS = [
  EstanciasAdminController,
  RoomsAdminController,
  JourneysController,
  RecordsController,
  DeparturesController,
  AuditController,
  ChildrenController,
  ConsentsController,
  EnrollmentMovementsController,
  GuardiansController,
  DossiersController,
  FollowUpsController,
  HealthController,
  AuthController,
  UsersController,
  IntegrationController,
  SystemsAdminController,
  ReportsController,
  SchoolYearsController,
  SyncController,
];
