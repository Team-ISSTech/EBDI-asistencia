import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { ApiEnv } from '@sirai/config';
import type { AuthContext, SessionResolver } from '../../../common/auth/auth-context';
import { API_ENV } from '../../../common/config/config.module';
import { packIp, type RequestContext } from '../../../common/http/request-context';
import { principalOf, type SessionRecord, type UserRecord } from '../identity.types';
import {
  SESSIONS_REPOSITORY,
  type SessionsRepository,
  type TransactionHook,
  USERS_REPOSITORY,
  type UsersRepository,
} from '../repositories/repositories';
import { initialEstanciaFor } from './session-response';

const TOKEN_BYTES = 32;
const MS_PER_HOUR = 60 * 60 * 1000;
/** Evita un UPDATE por petición: solo se extiende si pasó este intervalo. */
const TOUCH_INTERVAL_MS = 60_000;

export const hashToken = (token: string): Buffer => createHash('sha256').update(token).digest();

/**
 * Sesiones opacas en servidor: el cliente guarda un token aleatorio en una
 * cookie httpOnly; la base guarda solo su SHA-256. Expiración deslizante por
 * inactividad (SESSION_TTL_HOURS) con tope absoluto (SESSION_MAX_HOURS).
 */
@Injectable()
export class SessionService implements SessionResolver {
  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(SESSIONS_REPOSITORY) private readonly sessions: SessionsRepository,
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
  ) {}

  private slidingExpiry(now: Date, createdAt: Date): Date {
    const sliding = now.getTime() + this.env.SESSION_TTL_HOURS * MS_PER_HOUR;
    const absolute = createdAt.getTime() + this.env.SESSION_MAX_HOURS * MS_PER_HOUR;
    return new Date(Math.min(sliding, absolute));
  }

  /** Emite la sesión; `inSameTransaction` permite auditar en la misma transacción. */
  async issue(
    user: UserRecord,
    request: RequestContext,
    now = new Date(),
    inSameTransaction?: TransactionHook<number>,
  ): Promise<{ token: string; context: AuthContext }> {
    const token = randomBytes(TOKEN_BYTES).toString('base64url');
    const activeEstanciaId = initialEstanciaFor(user);
    const sessionId = await this.sessions.create(
      {
        userId: user.id,
        tokenHash: hashToken(token),
        activeEstanciaId,
        expiresAt: this.slidingExpiry(now, now),
        ipAddress: packIp(request.ip),
        userAgent: request.userAgent,
        createdAt: now,
      },
      inSameTransaction,
    );
    return { token, context: { sessionId, userId: user.id, principal: principalOf(user), activeEstanciaId } };
  }

  async resolve(token: string, now = new Date()): Promise<AuthContext | null> {
    const session = await this.sessions.findActiveByTokenHash(hashToken(token), now);
    if (!session) return null;
    const user = await this.users.findById(session.userId);
    if (!user || user.status !== 'ACTIVO') return null;
    await this.extendIfStale(session, now);
    return { sessionId: session.id, userId: user.id, principal: principalOf(user), activeEstanciaId: session.activeEstanciaId };
  }

  private async extendIfStale(session: SessionRecord, now: Date): Promise<void> {
    if (now.getTime() - session.lastUsedAt.getTime() < TOUCH_INTERVAL_MS) return;
    await this.sessions.touch(session.id, now, this.slidingExpiry(now, session.createdAt));
  }

  revoke(sessionId: number, inSameTransaction?: TransactionHook<void>, now = new Date()): Promise<void> {
    return this.sessions.revoke(sessionId, now, inSameTransaction);
  }

  switchEstancia(sessionId: number, estanciaId: number, inSameTransaction?: TransactionHook<void>): Promise<void> {
    return this.sessions.setActiveEstancia(sessionId, estanciaId, inSameTransaction);
  }
}
