import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { ApiEnv } from '@sirai/config';
import type { IntegrationTokenRequest, IntegrationTokenResponse } from '@sirai/contracts';
import { AuditService } from '../../../common/audit/audit.service';
import type { SystemContext, SystemResolver } from '../../../common/auth/auth-context';
import { API_ENV } from '../../../common/config/config.module';
import { ApiError } from '../../../common/errors/api-error';
import type { RequestContext } from '../../../common/http/request-context';
import { PasswordHasher } from '../../identity/services/password-hasher';
import type { SystemRecord } from '../integration.types';
import { SYSTEMS_REPOSITORY, type SystemsRepository } from '../repositories/systems.repository';
import { SystemRateLimiter } from './system-rate-limiter';
import { TokenSigner } from './token-signer';

export const INTEGRATION_CLOCK = Symbol('INTEGRATION_CLOCK');

const SYSTEMS_TABLE = 'sistemas_integracion';
const INVALID_CREDENTIALS = 'Credenciales de sistema inválidas.';
/** El último uso se actualiza como mucho una vez por minuto, no en cada petición. */
const TOUCH_INTERVAL_MS = 60_000;

/**
 * Emite los tokens de los sistemas externos y resuelve el Bearer de cada
 * petición (RF-37). Emitir verifica el secreto con argon2id; resolver revisa la
 * firma y vuelve a leer el sistema, así que revocarlo o quitarle un alcance
 * surte efecto al instante.
 */
@Injectable()
export class SystemTokenService implements SystemResolver, OnModuleInit {
  private dummyHash: Promise<string> | null = null;

  constructor(
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(SYSTEMS_REPOSITORY) private readonly systems: SystemsRepository,
    private readonly hasher: PasswordHasher,
    private readonly signer: TokenSigner,
    private readonly limiter: SystemRateLimiter,
    private readonly audit: AuditService,
    @Inject(INTEGRATION_CLOCK) private readonly clock: () => Date = () => new Date(),
  ) {}

  /** Precalcula el hash de relleno para que ni el primer intento sea más rápido. */
  async onModuleInit(): Promise<void> {
    await this.dummyHashValue();
  }

  /** Un secreto incorrecto, un clientId desconocido y un sistema revocado se ven idénticos desde fuera. */
  async issue(input: IntegrationTokenRequest, request: RequestContext): Promise<IntegrationTokenResponse> {
    const system = await this.systems.findByClientId(input.clientId.toLowerCase());
    const valid = await this.hasher.verify(system?.secretHash ?? (await this.dummyHashValue()), input.clientSecret);
    if (!system || !valid || system.status !== 'ACTIVO') throw await this.reject(system, request);
    const now = this.clock();
    const { token, expiresIn } = await this.signer.sign({ systemId: system.id, scopes: system.scopes }, now);
    await this.systems.touchLastUsed(system.id, now);
    await this.audit.record({ userId: null, systemId: system.id, roleCode: null, action: 'SISTEMA_TOKEN_EMITIDO', tableName: SYSTEMS_TABLE, recordId: String(system.id), request });
    return { accessToken: token, tokenType: 'Bearer', expiresIn, scope: system.scopes.join(' ') };
  }

  async resolve(token: string): Promise<SystemContext | null> {
    const now = this.clock();
    const claims = await this.signer.verify(token, now);
    if (!claims) return null;
    if (!this.limiter.allow(claims.systemId, this.env.INTEGRATION_RATE_LIMIT_PER_MINUTE, now)) {
      throw new ApiError('DEMASIADAS_SOLICITUDES', 'El sistema excedió su límite de peticiones por minuto.');
    }
    const system = await this.systems.findById(claims.systemId);
    if (system?.status !== 'ACTIVO') return null;
    await this.touchIfStale(system, now);
    return { systemId: system.id, name: system.name, scopes: claims.scopes.filter((scope) => system.scopes.includes(scope)) };
  }

  private async touchIfStale(system: SystemRecord, now: Date): Promise<void> {
    if (system.lastUsedAt === null || now.getTime() - system.lastUsedAt.getTime() >= TOUCH_INTERVAL_MS) await this.systems.touchLastUsed(system.id, now);
  }

  private async reject(system: SystemRecord | null, request: RequestContext): Promise<ApiError> {
    if (system) {
      await this.audit.record({ userId: null, systemId: system.id, roleCode: null, action: 'SISTEMA_TOKEN_FALLIDO', tableName: SYSTEMS_TABLE, recordId: String(system.id), after: { motivo: system.status === 'ACTIVO' ? 'SECRETO' : 'REVOCADO' }, request });
    }
    return new ApiError('CREDENCIALES_INVALIDAS', INVALID_CREDENTIALS);
  }

  private dummyHashValue(): Promise<string> {
    this.dummyHash ??= this.hasher.hash('sirai-relleno');
    return this.dummyHash;
  }
}
