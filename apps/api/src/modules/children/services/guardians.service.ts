import { Inject, Injectable } from '@nestjs/common';
import type { ChildGuardian, CreateGuardianRequest, Guardian, GuardianPhoneResponse, LinkGuardianRequest } from '@sirai/contracts';
import { AuditService } from '../../../common/audit/audit.service';
import type { AuthContext } from '../../../common/auth/auth-context';
import { EncryptionService } from '../../../common/crypto/encryption.service';
import { ApiError } from '../../../common/errors/api-error';
import type { RequestContext } from '../../../common/http/request-context';
import { rolesSummary } from '../../identity/services/session-response';
import type { ChildGuardianRecord, GuardianRecord } from '../children.types';
import { CHILDREN_REPOSITORY, type ChildrenRepository } from '../repositories/children.repository';
import { GUARDIANS_REPOSITORY, type GuardiansRepository } from '../repositories/guardians.repository';

const GUARDIANS_TABLE = 'tutores';
const CHILDREN_TABLE = 'infantes';

const toGuardianView = (guardian: GuardianRecord): Guardian => ({
  id: guardian.id,
  name: guardian.name,
  paternalSurname: guardian.paternalSurname,
  maternalSurname: guardian.maternalSurname,
  hasPhone: guardian.hasPhone,
});

const toChildGuardianView = (record: ChildGuardianRecord): ChildGuardian => ({
  ...toGuardianView(record),
  relationship: record.relationship,
  isPrimary: record.isPrimary,
  canPickUp: record.canPickUp,
  isEmergencyContact: record.isEmergencyContact,
  validFrom: record.validFrom,
  validUntil: record.validUntil,
});

/**
 * Tutores de los infantes de la estancia activa. El teléfono se guarda
 * cifrado y solo sale por `revealPhone`, que audita cada consulta.
 */
@Injectable()
export class GuardiansService {
  constructor(
    @Inject(CHILDREN_REPOSITORY) private readonly children: ChildrenRepository,
    @Inject(GUARDIANS_REPOSITORY) private readonly guardians: GuardiansRepository,
    private readonly encryption: EncryptionService,
    private readonly audit: AuditService,
  ) {}

  async create(auth: AuthContext, input: CreateGuardianRequest, request: RequestContext): Promise<Guardian> {
    this.requireEstancia(auth);
    const id = await this.guardians.create(
      {
        name: input.name,
        paternalSurname: input.paternalSurname,
        maternalSurname: input.maternalSurname,
        idType: input.idType,
        idFolio: input.idFolio,
        phoneEncrypted: this.encryption.encrypt(input.phone),
        phoneHash: this.encryption.blindHash(input.phone),
        email: input.email,
      },
      new Date(),
      (tx, newId) =>
        this.audit.record({ ...this.actor(auth), action: 'TUTOR_REGISTRADO', tableName: GUARDIANS_TABLE, recordId: String(newId), after: { name: input.name, paternalSurname: input.paternalSurname }, request }, tx),
    );
    return toGuardianView(await this.requireGuardian(id));
  }

  /** Listar tutores es una lectura de datos personales: se audita. */
  async listForChild(auth: AuthContext, childId: number, request: RequestContext): Promise<ChildGuardian[]> {
    await this.requireChild(auth, childId);
    const records = await this.guardians.listForChild(childId);
    await this.audit.record({ ...this.actor(auth), action: 'TUTORES_CONSULTADOS', tableName: CHILDREN_TABLE, recordId: String(childId), request });
    return records.map(toChildGuardianView);
  }

  async link(auth: AuthContext, childId: number, input: LinkGuardianRequest, request: RequestContext): Promise<ChildGuardian> {
    await this.requireChild(auth, childId);
    await this.requireGuardian(input.guardianId);
    if (input.isPrimary) await this.assertNoPrimary(childId);
    const { guardianId, ...link } = input;
    await this.guardians.link(childId, input, new Date(), (tx) =>
      this.audit.record({ ...this.actor(auth), action: 'TUTOR_VINCULADO', tableName: CHILDREN_TABLE, recordId: String(childId), after: { guardianId, ...link }, request }, tx),
    );
    const linked = (await this.guardians.listForChild(childId)).find((record) => record.id === guardianId);
    if (!linked) throw new ApiError('NO_ENCONTRADO', 'Vínculo no encontrado.');
    return toChildGuardianView(linked);
  }

  /**
   * Teléfono completo de un tutor. La bitácora se escribe antes de entregar
   * el dato: si no queda rastro, no hay respuesta.
   */
  async revealPhone(auth: AuthContext, guardianId: number, request: RequestContext): Promise<GuardianPhoneResponse> {
    const estanciaId = this.requireEstancia(auth);
    if (!(await this.guardians.isLinkedInEstancia(guardianId, estanciaId))) {
      throw new ApiError('NO_ENCONTRADO', 'Tutor no encontrado.');
    }
    const encrypted = await this.guardians.findPhoneEncrypted(guardianId);
    if (!encrypted) throw new ApiError('NO_ENCONTRADO', 'El tutor no tiene teléfono registrado.');
    await this.audit.record({ ...this.actor(auth), action: 'TELEFONO_CONSULTADO', tableName: GUARDIANS_TABLE, recordId: String(guardianId), request });
    return { phone: this.encryption.decrypt(encrypted) };
  }

  private async assertNoPrimary(childId: number): Promise<void> {
    const current = await this.guardians.listForChild(childId);
    if (current.some((record) => record.isPrimary)) {
      throw new ApiError('CONFLICTO', 'El infante ya tiene un tutor principal.');
    }
  }

  private async requireChild(auth: AuthContext, childId: number): Promise<void> {
    if (!(await this.children.findChild(childId, this.requireEstancia(auth)))) {
      throw new ApiError('NO_ENCONTRADO', 'Infante no encontrado.');
    }
  }

  private async requireGuardian(id: number): Promise<GuardianRecord> {
    const guardian = await this.guardians.findById(id);
    if (!guardian) throw new ApiError('NO_ENCONTRADO', 'Tutor no encontrado.');
    return guardian;
  }

  private requireEstancia(auth: AuthContext): number {
    if (auth.activeEstanciaId === null) throw new ApiError('FUERA_DE_ALCANCE', 'Selecciona una estancia para continuar.');
    return auth.activeEstanciaId;
  }

  private actor(auth: AuthContext): { userId: number; roleCode: string | null } {
    return { userId: auth.userId, roleCode: rolesSummary(auth.principal.assignments) };
  }
}
