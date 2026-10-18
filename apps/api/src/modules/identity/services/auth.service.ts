import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { ApiEnv } from '@sirai/config';
import type { ChangePasswordRequest, LoginRequest, SessionResponse } from '@sirai/contracts';
import { checkNewPassword, isTemporaryPasswordExpired } from '@sirai/domain';
import { AuditService } from '../../../common/audit/audit.service';
import type { AuthContext } from '../../../common/auth/auth-context';
import { API_ENV } from '../../../common/config/config.module';
import { ApiError } from '../../../common/errors/api-error';
import type { RequestContext } from '../../../common/http/request-context';
import type { EstanciaSummaryRecord, UserRecord } from '../identity.types';
import { ESTANCIAS_REPOSITORY, type EstanciasRepository, USERS_REPOSITORY, type UsersRepository } from '../repositories/repositories';
import { PasswordHasher } from './password-hasher';
import { buildSessionResponse, hasAccessToEstancia, hasGlobalAssignment, rolesSummary } from './session-response';
import { SessionService } from './session.service';

const USERS_TABLE = 'usuarios';
const SESSIONS_TABLE = 'sesiones';
const INVALID_CREDENTIALS = 'Correo o contraseña incorrectos.';
const CHANGE_PASSWORD_MESSAGES = {
  MUY_CORTA: 'La contraseña nueva es demasiado corta.',
  IGUAL_A_LA_ACTUAL: 'La contraseña nueva debe ser distinta de la actual.',
} as const;

export interface LoginResult {
  readonly token: string;
  readonly session: SessionResponse;
}

@Injectable()
export class AuthService implements OnModuleInit {
  private dummyHash: Promise<string> | null = null;

  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    @Inject(ESTANCIAS_REPOSITORY) private readonly estancias: EstanciasRepository,
    private readonly hasher: PasswordHasher,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Orden deliberado: la contraseña se verifica siempre (incluso con cuenta
   * bloqueada o inexistente) para que el tiempo de respuesta y el código de
   * error no revelen si el correo existe ni si está bloqueado. El bloqueo
   * solo se comunica a quien ya demostró conocer la contraseña.
   */
  async login(credentials: LoginRequest, request: RequestContext, now = new Date()): Promise<LoginResult> {
    const user = await this.users.findByEmail(credentials.email);
    if (!user || user.status !== 'ACTIVO') throw await this.rejectUnknownUser(user, credentials, request);
    const isLocked = user.lockedUntil !== null && user.lockedUntil > now;
    if (!(await this.hasher.verify(user.passwordHash, credentials.password))) {
      throw isLocked ? new ApiError('CREDENCIALES_INVALIDAS', INVALID_CREDENTIALS) : await this.handleFailedAttempt(user, request, now);
    }
    if (isLocked) throw new ApiError('CUENTA_BLOQUEADA', 'Cuenta bloqueada por intentos fallidos. Intenta de nuevo más tarde.');
    if (user.mustChangePassword && isTemporaryPasswordExpired(user.temporaryPasswordExpiresAt, now)) {
      throw await this.rejectExpiredTemporary(user, request);
    }
    return this.openSession(user, request, now);
  }

  /** La caducidad solo se dice a quien ya dio la contraseña temporal correcta. */
  private async rejectExpiredTemporary(user: UserRecord, request: RequestContext): Promise<ApiError> {
    await this.audit.record({
      userId: user.id,
      roleCode: rolesSummary(user.assignments),
      action: 'LOGIN_FALLIDO',
      tableName: USERS_TABLE,
      recordId: String(user.id),
      after: { motivo: 'TEMPORAL_CADUCADA' },
      request,
    });
    return new ApiError('CONTRASENA_TEMPORAL_CADUCADA', 'La contraseña temporal caducó. Pide a un administrador que te asigne una nueva.');
  }

  /**
   * Cambia la contraseña de quien ya tiene sesión. Verificar la actual cuenta
   * como intento fallido igual que en el login: una sesión robada no sirve para
   * adivinar la contraseña. Al cambiarla se cierran las demás sesiones.
   */
  async changePassword(auth: AuthContext, input: ChangePasswordRequest, request: RequestContext, now = new Date()): Promise<SessionResponse> {
    const user = await this.requireUser(auth);
    if (user.lockedUntil !== null && user.lockedUntil > now) {
      throw new ApiError('CUENTA_BLOQUEADA', 'Cuenta bloqueada por intentos fallidos. Intenta de nuevo más tarde.');
    }
    if (!(await this.hasher.verify(user.passwordHash, input.currentPassword))) {
      const failure = await this.handleFailedAttempt(user, request, now);
      throw new ApiError(failure.code, 'La contraseña actual es incorrecta.');
    }
    const check = checkNewPassword(input.newPassword, input.currentPassword);
    if (!check.ok) throw new ApiError('DATOS_INVALIDOS', CHANGE_PASSWORD_MESSAGES[check.reason]);
    await this.users.changePassword(user.id, await this.hasher.hash(input.newPassword), now, auth.sessionId, (tx) =>
      this.audit.record(
        { ...this.actor(user, auth), action: 'CONTRASENA_CAMBIADA', tableName: USERS_TABLE, recordId: String(user.id), after: { eraTemporal: user.mustChangePassword }, request },
        tx,
      ),
    );
    return this.me({ ...auth, mustChangePassword: false });
  }

  /** Verifica contra un hash de relleno para que el tiempo de respuesta no revele si el correo existe. */
  private async rejectUnknownUser(user: UserRecord | null, credentials: LoginRequest, request: RequestContext): Promise<ApiError> {
    await this.hasher.verify(await this.dummyHashValue(), credentials.password);
    await this.audit.record({
      userId: user?.id ?? null,
      roleCode: null,
      action: 'LOGIN_FALLIDO',
      tableName: USERS_TABLE,
      recordId: user ? String(user.id) : null,
      after: { email: credentials.email, motivo: user ? 'INACTIVO' : 'INEXISTENTE' },
      request,
    });
    return new ApiError('CREDENCIALES_INVALIDAS', INVALID_CREDENTIALS);
  }

  /** Sesión, reinicio del contador de fallos y auditoría se confirman en la misma transacción. */
  private async openSession(user: UserRecord, request: RequestContext, now: Date): Promise<LoginResult> {
    const { token, context } = await this.sessions.issue(user, request, now, async (tx, sessionId) => {
      await this.users.registerSuccessfulLogin(user.id, now, tx);
      await this.audit.record(
        { ...this.actor(user, { activeEstanciaId: null }), action: 'LOGIN', tableName: SESSIONS_TABLE, recordId: String(sessionId), request },
        tx,
      );
    });
    return { token, session: await this.me(context) };
  }

  /** Precalcula el hash de relleno para que ni el primer intento sea más rápido. */
  async onModuleInit(): Promise<void> {
    await this.dummyHashValue();
  }

  private dummyHashValue(): Promise<string> {
    this.dummyHash ??= this.hasher.hash('sirai-relleno');
    return this.dummyHash;
  }

  private async handleFailedAttempt(user: UserRecord, request: RequestContext, now: Date): Promise<ApiError> {
    const policy = { maxAttempts: this.env.LOGIN_MAX_ATTEMPTS, lockMinutes: this.env.LOGIN_LOCK_MINUTES };
    const { locked } = await this.users.registerFailedLogin(user.id, policy, now);
    await this.audit.record({
      userId: user.id,
      roleCode: rolesSummary(user.assignments),
      action: locked ? 'CUENTA_BLOQUEADA' : 'LOGIN_FALLIDO',
      tableName: USERS_TABLE,
      recordId: String(user.id),
      request,
    });
    return new ApiError('CREDENCIALES_INVALIDAS', INVALID_CREDENTIALS);
  }

  async logout(auth: AuthContext, request: RequestContext): Promise<void> {
    await this.sessions.revoke(auth.sessionId, (tx) =>
      this.audit.record(
        {
          userId: auth.userId,
          roleCode: rolesSummary(auth.principal.assignments),
          action: 'LOGOUT',
          tableName: SESSIONS_TABLE,
          recordId: String(auth.sessionId),
          request,
        },
        tx,
      ),
    );
  }

  async me(auth: AuthContext): Promise<SessionResponse> {
    const user = await this.requireUser(auth);
    const active = auth.activeEstanciaId === null ? null : await this.estancias.findById(auth.activeEstanciaId);
    return buildSessionResponse(user, active, await this.availableEstancias(user));
  }

  async switchEstancia(auth: AuthContext, estanciaId: number, request: RequestContext): Promise<SessionResponse> {
    const user = await this.requireUser(auth);
    const estancia = await this.estancias.findById(estanciaId);
    if (!estancia || !hasAccessToEstancia(user, estanciaId)) {
      throw new ApiError('FUERA_DE_ALCANCE', 'No tienes acceso a esa estancia.');
    }
    await this.sessions.switchEstancia(auth.sessionId, estanciaId, (tx) =>
      this.audit.record(
        {
          ...this.actor(user, auth),
          action: 'CAMBIO_ESTANCIA',
          tableName: SESSIONS_TABLE,
          recordId: String(auth.sessionId),
          before: { estanciaId: auth.activeEstanciaId },
          after: { estanciaId },
          request,
        },
        tx,
      ),
    );
    return buildSessionResponse(user, estancia, await this.availableEstancias(user));
  }

  private async requireUser(auth: AuthContext): Promise<UserRecord> {
    const user = await this.users.findById(auth.userId);
    if (!user) throw new ApiError('NO_AUTENTICADO', 'La sesión ya no es válida.');
    return user;
  }

  private async availableEstancias(user: UserRecord): Promise<EstanciaSummaryRecord[]> {
    if (hasGlobalAssignment(user)) return this.estancias.listActive();
    const seen = new Map<number, EstanciaSummaryRecord>();
    for (const a of user.assignments) {
      if (a.estanciaId !== null && a.estanciaName !== null) seen.set(a.estanciaId, { id: a.estanciaId, name: a.estanciaName });
    }
    return [...seen.values()];
  }

  private actor(user: UserRecord, auth: Pick<AuthContext, 'activeEstanciaId'>): { userId: number; roleCode: string | null } {
    const applicable = user.assignments.filter((a) => a.estanciaId === null || a.estanciaId === auth.activeEstanciaId);
    return { userId: user.id, roleCode: rolesSummary(applicable.length > 0 ? applicable : user.assignments) };
  }
}
