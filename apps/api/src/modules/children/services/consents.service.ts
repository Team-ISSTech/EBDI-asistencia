import { Inject, Injectable } from '@nestjs/common';
import type { ApiEnv } from '@sirai/config';
import type { Consent, RegisterConsentRequest } from '@sirai/contracts';
import { canRevoke, currentConsentStatus } from '@sirai/domain';
import { AuditService } from '../../../common/audit/audit.service';
import type { AuthContext } from '../../../common/auth/auth-context';
import { API_ENV } from '../../../common/config/config.module';
import { ApiError } from '../../../common/errors/api-error';
import type { RequestContext } from '../../../common/http/request-context';
import { rolesSummary } from '../../identity/services/session-response';
import type { ConsentRecord } from '../children.types';
import { CHILDREN_REPOSITORY, type ChildrenRepository } from '../repositories/children.repository';
import { CONSENTS_REPOSITORY, type ConsentsRepository } from '../repositories/consents.repository';
import { GUARDIANS_REPOSITORY, type GuardiansRepository } from '../repositories/guardians.repository';
import { CLOCK } from './children.service';

const CONSENTS_TABLE = 'consentimientos';
const CHILDREN_TABLE = 'infantes';
/** Solo fuera de producción: la configuración exige la versión real al arrancar en producción. */
const DEV_NOTICE_VERSION = 'SIN-VERSION-DESARROLLO';

const toView = (record: ConsentRecord): Consent => ({
  id: record.id,
  childId: record.childId,
  guardianId: record.guardianId,
  type: record.type,
  noticeVersion: record.noticeVersion,
  accepted: record.accepted,
  acceptedAt: record.acceptedAt.toISOString(),
  revokedAt: record.revokedAt?.toISOString() ?? null,
});

/** Un hecho de consentimiento tal como lo entiende `@sirai/domain`. */
const toFact = (record: ConsentRecord) => ({
  type: record.type,
  accepted: record.accepted,
  acceptedAt: record.acceptedAt.toISOString(),
  revokedAt: record.revokedAt?.toISOString() ?? null,
});

/**
 * Consentimiento del tutor sobre el tratamiento de datos y el contacto
 * telefónico. Revocar marca `revocado_at`: la evidencia nunca se borra.
 */
@Injectable()
export class ConsentsService {
  constructor(
    @Inject(CHILDREN_REPOSITORY) private readonly children: ChildrenRepository,
    @Inject(GUARDIANS_REPOSITORY) private readonly guardians: GuardiansRepository,
    @Inject(CONSENTS_REPOSITORY) private readonly consents: ConsentsRepository,
    private readonly audit: AuditService,
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(CLOCK) private readonly clock: () => Date = () => new Date(),
  ) {}

  async list(auth: AuthContext, childId: number, request: RequestContext): Promise<Consent[]> {
    await this.requireChild(auth, childId);
    const records = await this.consents.listForChild(childId);
    await this.audit.record({ ...this.actor(auth), action: 'CONSENTIMIENTOS_CONSULTADOS', tableName: CHILDREN_TABLE, recordId: String(childId), request });
    return records.map(toView);
  }

  async register(auth: AuthContext, childId: number, input: RegisterConsentRequest, request: RequestContext): Promise<Consent> {
    await this.requireChild(auth, childId);
    await this.requireLinkedGuardian(childId, input.guardianId);
    await this.assertNotAlreadyAccepted(childId, input);
    const now = this.clock();
    const consent = { childId, ...input, noticeVersion: this.env.PRIVACY_NOTICE_VERSION ?? DEV_NOTICE_VERSION };
    const id = await this.consents.create(consent, now, auth.userId, (tx, newId) =>
      this.audit.record({ ...this.actor(auth), action: 'CONSENTIMIENTO_REGISTRADO', tableName: CONSENTS_TABLE, recordId: String(newId), after: consent, request }, tx),
    );
    return toView(await this.requireConsent(auth, id));
  }

  async revoke(auth: AuthContext, consentId: number, request: RequestContext): Promise<Consent> {
    const current = await this.requireConsent(auth, consentId);
    if (!canRevoke({ accepted: current.accepted, revokedAt: current.revokedAt?.toISOString() ?? null })) {
      throw new ApiError('CONFLICTO', 'Solo se puede revocar una aceptación vigente.');
    }
    const at = this.clock();
    await this.consents.revoke(consentId, at, (tx) =>
      this.audit.record(
        {
          ...this.actor(auth),
          action: 'CONSENTIMIENTO_REVOCADO',
          tableName: CONSENTS_TABLE,
          recordId: String(consentId),
          before: { revokedAt: null },
          after: { revokedAt: at.toISOString() },
          request,
        },
        tx,
      ),
    );
    return toView(await this.requireConsent(auth, consentId));
  }

  private async assertNotAlreadyAccepted(childId: number, input: RegisterConsentRequest): Promise<void> {
    if (!input.accepted) return;
    const own = (await this.consents.listForChild(childId)).filter((record) => record.guardianId === input.guardianId);
    if (currentConsentStatus(own.map(toFact), input.type) === 'ACEPTADO') {
      throw new ApiError('CONFLICTO', 'Ya hay una aceptación vigente de este consentimiento.');
    }
  }

  private async requireLinkedGuardian(childId: number, guardianId: number): Promise<void> {
    const linked = await this.guardians.listForChild(childId);
    if (!linked.some((guardian) => guardian.id === guardianId)) {
      throw new ApiError('DATOS_INVALIDOS', 'El tutor no está vinculado a este infante.');
    }
  }

  /** El consentimiento pertenece a un infante: si ese infante no es de la estancia, no existe. */
  private async requireConsent(auth: AuthContext, id: number): Promise<ConsentRecord> {
    const record = await this.consents.findById(id);
    if (!record) throw new ApiError('NO_ENCONTRADO', 'Consentimiento no encontrado.');
    await this.requireChild(auth, record.childId);
    return record;
  }

  private async requireChild(auth: AuthContext, childId: number): Promise<void> {
    if (auth.activeEstanciaId === null) throw new ApiError('FUERA_DE_ALCANCE', 'Selecciona una estancia para continuar.');
    if (!(await this.children.findChild(childId, auth.activeEstanciaId))) throw new ApiError('NO_ENCONTRADO', 'Infante no encontrado.');
  }

  private actor(auth: AuthContext): { userId: number; roleCode: string | null } {
    return { userId: auth.userId, roleCode: rolesSummary(auth.principal.assignments) };
  }
}
