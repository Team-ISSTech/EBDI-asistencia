import { randomBytes } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { CreatedSystemResponse, CreateSystemRequest, SystemView } from '@sirai/contracts';
import { AuditService } from '../../../common/audit/audit.service';
import type { AuthContext } from '../../../common/auth/auth-context';
import { ApiError } from '../../../common/errors/api-error';
import type { RequestContext } from '../../../common/http/request-context';
import { PasswordHasher } from '../../identity/services/password-hasher';
import { rolesSummary } from '../../identity/services/session-response';
import type { SystemRecord } from '../integration.types';
import { SYSTEMS_REPOSITORY, type SystemsRepository } from '../repositories/systems.repository';

const SYSTEMS_TABLE = 'sistemas_integracion';
const CLIENT_ID_BYTES = 16;
const SECRET_BYTES = 32;

export const toSystemView = (system: SystemRecord): SystemView => ({
  id: system.id,
  name: system.name,
  clientId: system.clientId,
  scopes: [...system.scopes],
  status: system.status,
  lastUsedAt: system.lastUsedAt?.toISOString() ?? null,
  createdAt: system.createdAt.toISOString(),
  revokedAt: system.revokedAt?.toISOString() ?? null,
});

/**
 * Alta y baja de sistemas externos por el administrador central (RF-37). El
 * secreto se genera aquí, se entrega una sola vez y solo se guarda su hash;
 * si se pierde no se recupera, se registra un sistema nuevo. Revocar no borra.
 */
@Injectable()
export class SystemsAdminService {
  constructor(
    @Inject(SYSTEMS_REPOSITORY) private readonly systems: SystemsRepository,
    private readonly hasher: PasswordHasher,
    private readonly audit: AuditService,
  ) {}

  async create(auth: AuthContext, input: CreateSystemRequest, request: RequestContext): Promise<CreatedSystemResponse> {
    const clientId = randomBytes(CLIENT_ID_BYTES).toString('hex');
    const clientSecret = `sirai_${randomBytes(SECRET_BYTES).toString('base64url')}`;
    const id = await this.systems.create(
      { name: input.name, clientId, secretHash: await this.hasher.hash(clientSecret), scopes: input.scopes, createdBy: auth.userId },
      new Date(),
      (tx, newId) =>
        this.audit.record({ ...this.actor(auth), action: 'SISTEMA_REGISTRADO', tableName: SYSTEMS_TABLE, recordId: String(newId), after: { name: input.name, scopes: input.scopes }, request }, tx),
    );
    return { system: toSystemView(await this.require(id)), clientSecret };
  }

  async list(): Promise<SystemView[]> {
    return (await this.systems.list()).map(toSystemView);
  }

  async revoke(auth: AuthContext, id: number, request: RequestContext): Promise<void> {
    const system = await this.require(id);
    if (system.status === 'REVOCADO') throw new ApiError('CONFLICTO', 'El sistema ya está revocado.');
    await this.systems.revoke(id, auth.userId, new Date(), (tx) =>
      this.audit.record({ ...this.actor(auth), action: 'SISTEMA_REVOCADO', tableName: SYSTEMS_TABLE, recordId: String(id), before: { name: system.name, status: system.status }, request }, tx),
    );
  }

  private async require(id: number): Promise<SystemRecord> {
    const system = await this.systems.findById(id);
    if (!system) throw new ApiError('NO_ENCONTRADO', 'Sistema no encontrado.');
    return system;
  }

  private actor(auth: AuthContext): { userId: number; roleCode: string | null } {
    return { userId: auth.userId, roleCode: rolesSummary(auth.principal.assignments) };
  }
}
