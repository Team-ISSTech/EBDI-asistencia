import { Inject, Injectable } from '@nestjs/common';
import type { CreateUserRequest, ReplaceRolesRequest, User } from '@sirai/contracts';
import { AuditService } from '../../../common/audit/audit.service';
import type { AuthContext } from '../../../common/auth/auth-context';
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
    const id = await this.users.createWithAssignments(
      {
        name: input.name,
        email: input.email,
        passwordHash: await this.hasher.hash(input.temporaryPassword),
        defaultEstanciaId: input.assignments.find((a) => a.estanciaId !== null)?.estanciaId ?? null,
      },
      input.assignments,
      new Date(),
      (tx, newId) =>
        this.audit.record({ ...this.actor(auth), action: 'USUARIO_CREADO', tableName: USERS_TABLE, recordId: String(newId), after, request }, tx),
    );
    return toUserView(await this.requireUser(id));
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
