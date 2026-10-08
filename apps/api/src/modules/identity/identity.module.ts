import { Module } from '@nestjs/common';
import { SESSION_RESOLVER } from '../../common/auth/auth-context';
import { AuthController } from './controllers/auth.controller';
import { UsersController } from './controllers/users.controller';
import { DrizzleEstanciasRepository } from './repositories/drizzle-estancias.repository';
import { DrizzleSessionsRepository } from './repositories/drizzle-sessions.repository';
import { DrizzleUsersRepository } from './repositories/drizzle-users.repository';
import { ESTANCIAS_REPOSITORY, SESSIONS_REPOSITORY, USERS_REPOSITORY } from './repositories/repositories';
import { AuthService } from './services/auth.service';
import { Argon2PasswordHasher, PasswordHasher } from './services/password-hasher';
import { SessionService } from './services/session.service';
import { UsersService } from './services/users.service';

@Module({
  controllers: [AuthController, UsersController],
  providers: [
    { provide: USERS_REPOSITORY, useClass: DrizzleUsersRepository },
    { provide: SESSIONS_REPOSITORY, useClass: DrizzleSessionsRepository },
    { provide: ESTANCIAS_REPOSITORY, useClass: DrizzleEstanciasRepository },
    { provide: PasswordHasher, useClass: Argon2PasswordHasher },
    SessionService,
    { provide: SESSION_RESOLVER, useExisting: SessionService },
    AuthService,
    UsersService,
  ],
  exports: [SESSION_RESOLVER],
})
export class IdentityModule {}
