import { Inject, Injectable } from '@nestjs/common';
import type { CreateEstanciaRequest, EstanciaAdmin, UpdateEstanciaRequest } from '@sirai/contracts';
import { canRetireEstancia, type RetireEstanciaCheck } from '@sirai/domain';
import { AuditService } from '../../../common/audit/audit.service';
import type { AuthContext } from '../../../common/auth/auth-context';
import { ApiError } from '../../../common/errors/api-error';
import type { RequestContext } from '../../../common/http/request-context';
import { rolesSummary } from '../../identity/services/session-response';
import type { EstanciaChanges, EstanciaRecord } from '../administration.types';
import { ESTANCIAS_ADMIN_REPOSITORY, type EstanciasAdminRepository } from '../repositories/estancias-admin.repository';

export const ADMIN_CLOCK = Symbol('ADMIN_CLOCK');

const ESTANCIAS_TABLE = 'estancias';

const RETIRE_MESSAGES: Record<Exclude<RetireEstanciaCheck, { ok: true }>['reason'], string> = {
  CON_INSCRITOS: 'La estancia tiene infantes con inscripción activa: muévelos o dalos de baja antes.',
  CON_JORNADAS_ABIERTAS: 'La estancia tiene jornadas de asistencia abiertas: ciérralas antes.',
};

const toView = (record: EstanciaRecord): EstanciaAdmin => ({ ...record });

/** Solo los campos que realmente cambian, para auditar el antes y el después sin ruido. */
const diff = (current: EstanciaRecord, changes: EstanciaChanges): { before: Record<string, unknown>; after: Record<string, unknown>; changed: EstanciaChanges } => {
  const before: Record<string, unknown> = {};
  const after: Record<string, unknown> = {};
  for (const key of Object.keys(changes) as Array<keyof EstanciaChanges>) {
    const value = changes[key];
    if (value !== undefined && current[key] !== value) {
      before[key] = current[key];
      after[key] = value;
    }
  }
  return { before, after, changed: after };
};

/**
 * Catálogo de estancias (RF-31), a cargo del administrador central. Una
 * estancia no se borra: se desactiva o se da de baja con borrado lógico, y solo
 * si no tiene inscritos activos ni jornadas abiertas.
 */
@Injectable()
export class EstanciasAdminService {
  constructor(
    @Inject(ESTANCIAS_ADMIN_REPOSITORY) private readonly estancias: EstanciasAdminRepository,
    private readonly audit: AuditService,
    @Inject(ADMIN_CLOCK) private readonly clock: () => Date = () => new Date(),
  ) {}

  async list(): Promise<EstanciaAdmin[]> {
    return (await this.estancias.list()).map(toView);
  }

  async create(auth: AuthContext, input: CreateEstanciaRequest, request: RequestContext): Promise<EstanciaAdmin> {
    const id = await this.estancias.create(input, this.clock(), (tx, newId) =>
      this.audit.record({ ...this.actor(auth), action: 'ESTANCIA_CREADA', tableName: ESTANCIAS_TABLE, recordId: String(newId), after: input, request }, tx),
    );
    return toView(await this.require(id));
  }

  async update(auth: AuthContext, id: number, input: UpdateEstanciaRequest, request: RequestContext): Promise<EstanciaAdmin> {
    const current = await this.require(id);
    const { before, after, changed } = diff(current, input);
    if (Object.keys(changed).length === 0) return toView(current);
    if (changed.status === 'INACTIVA') await this.assertCanRetire(id);
    await this.estancias.update(id, changed, this.clock(), (tx) =>
      this.audit.record({ ...this.actor(auth), action: 'ESTANCIA_ACTUALIZADA', tableName: ESTANCIAS_TABLE, recordId: String(id), before, after, request }, tx),
    );
    return toView(await this.require(id));
  }

  /** Baja lógica: la estancia deja de aparecer, pero su historial se conserva. */
  async retire(auth: AuthContext, id: number, request: RequestContext): Promise<void> {
    const current = await this.require(id);
    await this.assertCanRetire(id);
    await this.estancias.retire(id, auth.userId, this.clock(), (tx) =>
      this.audit.record({ ...this.actor(auth), action: 'ESTANCIA_DADA_DE_BAJA', tableName: ESTANCIAS_TABLE, recordId: String(id), before: { code: current.code, status: current.status }, request }, tx),
    );
  }

  private async assertCanRetire(id: number): Promise<void> {
    const check = canRetireEstancia(await this.estancias.usage(id));
    if (!check.ok) throw new ApiError('CONFLICTO', RETIRE_MESSAGES[check.reason]);
  }

  private async require(id: number): Promise<EstanciaRecord> {
    const record = await this.estancias.findById(id);
    if (!record) throw new ApiError('NO_ENCONTRADO', 'Estancia no encontrada.');
    return record;
  }

  private actor(auth: AuthContext): { userId: number; roleCode: string | null } {
    return { userId: auth.userId, roleCode: rolesSummary(auth.principal.assignments) };
  }
}
