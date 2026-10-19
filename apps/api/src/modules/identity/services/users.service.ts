import { Inject, Injectable } from '@nestjs/common';
import type { ApiEnv } from '@sirai/config';
import type { CreateUserRequest, ReplaceRolesRequest, ResetPasswordRequest, User } from '@sirai/contracts';
import { temporaryPasswordExpiry } from '@sirai/domain';
import { AuditService } from '../../../common/audit/audit.service';
import type { AuthContext } from '../../../common/auth/auth-context';
import { API_ENV } from '../../../common/config/config.module';
import { ApiError } from '../../../common/errors/api-error';
import type { RequestContext } from '../../../common/http/request-context';
import type { UserRecord } from '../identity.types';
import { USERS_REPOSITORY, type UsersRepository } from '../repositories/repositories';
import { PasswordHasher } from './password-hasher';
import { rolesSummary } from './session-response';

const USERS_TABLE = 'usuarios';

export const toUserView = (user: UserRecord): User => ({
  id: user.id,
  name: user.name,
  email: user.email,
  status: user.status,
  assignments: user.assignments.map(({ role, estanciaId }) => ({ role, estanciaId })),
  lastAccessAt: user.lastAccessAt?.toISOString() ?? null,
});

/**
 * Administración de usuarios. En Fase 1 `USUARIO_ADMINISTRAR` solo lo tiene
 * ADMIN_CENTRAL (alcance global), así que no hay filtrado por estancia; si el
 * cliente concede el permiso a un rol de estancia, el alcance se añade aquí.
 */
@Injectable()
export class UsersService {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    private readonly hasher: PasswordHasher,
    private readonly audit: AuditService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  /** Consultar el padrón de personal es una lectura de datos personales: se audita. */
  async list(auth: AuthContext, request: RequestContext): Promise<User[]> {
    const records = await this.users.list({ estanciaId: null });
    await this.audit.record({ ...this.actor(auth), action: 'USUARIOS_CONSULTADOS', tableName: USERS_TABLE, recordId: null, request });
    return records.map(toUserView);
  }

  /** Alta, asignaciones y auditoría en una sola transacción. */
  async create(auth: AuthContext, input: CreateUserRequest, request: RequestContext): Promise<User> {
    const after = { name: input.name, email: input.email, assignments: input.assignments };
    const now = new Date();
    const id = await this.users.createWithAssignments(
      {
        name: input.name,
        email: input.email,
        passwordHash: await this.hasher.hash(input.temporaryPassword),
        mustChangePassword: true,
        temporaryPasswordExpiresAt: temporaryPasswordExpiry(now, this.env.TEMP_PASSWORD_DAYS),
        defaultEstanciaId: input.assignments.find((a) => a.estanciaId !== null)?.estanciaId ?? null,
      },
      input.assignments,
      now,
      (tx, newId) =>
        this.audit.record({ ...this.actor(auth), action: 'USUARIO_CREADO', tableName: USERS_TABLE, recordId: String(newId), after, request }, tx),
    );
    return toUserView(await this.requireUser(id));
  }

  /**
   * Restablece la contraseña de otra persona: una temporal nueva que debe cambiar
   * al entrar, con la cuenta desbloqueada y sus sesiones cerradas. La propia
   * contraseña se cambia desde la cuenta, no por aquí.
   */
  async resetPassword(auth: AuthContext, userId: number, input: ResetPasswordRequest, request: RequestContext): Promise<User> {
    await this.requireUser(userId);
    if (userId === auth.userId) throw new ApiError('FUERA_DE_ALCANCE', 'Para cambiar tu propia contraseña usa la opción de tu cuenta.');
    const now = new Date();
    await this.users.setTemporaryPassword(
      userId,
      await this.hasher.hash(input.temporaryPassword),
      temporaryPasswordExpiry(now, this.env.TEMP_PASSWORD_DAYS),
      now,
      (tx) => this.audit.record({ ...this.actor(auth), action: 'CONTRASENA_RESTABLECIDA', tableName: USERS_TABLE, recordId: String(userId), request }, tx),
    );
    return toUserView(await this.requireUser(userId));
  }

  /**
   * Baja lógica de una cuenta (RNF-04): deja de poder entrar y sus sesiones se
   * cierran, pero su rastro en la bitácora y sus asignaciones se conservan. No
   * se permite a uno mismo: así siempre queda al menos un administrador central
   * (solo ese rol tiene USUARIO_ADMINISTRAR).
   */
  async retire(auth: AuthContext, userId: number, request: RequestContext): Promise<void> {
    const target = await this.requireUser(userId);
    if (userId === auth.userId) throw new ApiError('FUERA_DE_ALCANCE', 'No puedes darte de baja a ti mismo.');
    await this.users.softDelete(userId, auth.userId, new Date(), (tx) =>
      this.audit.record({ ...this.actor(auth), action: 'USUARIO_DADO_DE_BAJA', tableName: USERS_TABLE, recordId: String(userId), before: { name: target.name, email: target.email, status: target.status }, request }, tx),
    );
  }

  async replaceRoles(auth: AuthContext, userId: number, input: ReplaceRolesRequest, request: RequestContext): Promise<User> {
    const target = await this.requireUser(userId);
    this.assertKeepsOwnAdminRole(auth, userId, input);
    const before = toUserView(target);
    const after = { assignments: input.assignments };
    await this.users.replaceAssignments(userId, input.assignments, new Date(), (tx) =>
      this.audit.record({ ...this.actor(auth), action: 'ROLES_REEMPLAZADOS', tableName: USERS_TABLE, recordId: String(userId), before, after, request }, tx),
    );
    return toUserView(await this.requireUser(userId));
  }

  /** Nadie puede quitarse a sí mismo ADMIN_CENTRAL: evita dejar el sistema sin administración. */
  private assertKeepsOwnAdminRole(auth: AuthContext, userId: number, input: ReplaceRolesRequest): void {
    if (userId !== auth.userId) return;
    if (!input.assignments.some((a) => a.role === 'ADMIN_CENTRAL')) {
      throw new ApiError('FUERA_DE_ALCANCE', 'No puedes quitarte tu propio rol de administración central.');
    }
  }

  private actor(auth: AuthContext): { userId: number; roleCode: string | null } {
    return { userId: auth.userId, roleCode: rolesSummary(auth.principal.assignments) };
  }

  private async requireUser(id: number): Promise<UserRecord> {
    const user = await this.users.findById(id);
    if (!user) throw new ApiError('NO_ENCONTRADO', 'Usuario no encontrado.');
    return user;
  }
}
