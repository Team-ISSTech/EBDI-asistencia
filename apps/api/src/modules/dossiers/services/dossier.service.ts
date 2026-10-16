import { createHash, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { VerifyDossierRequest, VerifyDossierResponse } from '@sirai/contracts';
import { dossierFolio, parseDossierFolio } from '@sirai/domain';
import { AuditService } from '../../../common/audit/audit.service.js';
import type { AuthContext } from '../../../common/auth/auth-context.js';
import { EncryptionService } from '../../../common/crypto/encryption.service.js';
import { ApiError } from '../../../common/errors/api-error.js';
import type { RequestContext } from '../../../common/http/request-context.js';
import type { DossierDocument, DossierRaw } from '../dossiers.types.js';
import { DOSSIERS_REPOSITORY, type DossiersRepository } from '../repositories/dossiers.repository.js';
import { buildDossierPdf, type DossierPdfOptions } from './dossier-pdf.js';

export const DOSSIERS_CLOCK = Symbol('DOSSIERS_CLOCK');
export const DOSSIER_PDF_OPTIONS = Symbol('DOSSIER_PDF_OPTIONS');

const DOSSIERS_TABLE = 'expedientes_emitidos';

export interface DossierFile {
  readonly filename: string;
  readonly buffer: Buffer;
}

/** JSON con llaves ordenadas: la misma información da siempre el mismo texto (y la misma huella). */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** Lo que firma el sello: folio, infante, instante de emisión y huella del contenido. */
export const sealMessage = (folio: string, childId: number, issuedAt: Date, contentSha256Hex: string): string =>
  `${folio}|${childId}|${issuedAt.toISOString()}|${contentSha256Hex}`;

const join = (...parts: readonly (string | null)[]): string => parts.filter((part): part is string => Boolean(part)).join(' ');
const sameBytes = (a: Buffer, b: Buffer): boolean => a.length === b.length && timingSafeEqual(a, b);

/**
 * Expediente de un infante para traslados (RF-19). Lo emite quien tiene
 * `EXPEDIENTE_EXPORTAR` y tiene al infante inscrito en su estancia activa. Cada
 * emisión se folia, se sella y se audita; el sello permite verificar después
 * que un PDF es auténtico.
 */
@Injectable()
export class DossierService {
  constructor(
    @Inject(DOSSIERS_REPOSITORY) private readonly dossiers: DossiersRepository,
    private readonly encryption: EncryptionService,
    private readonly audit: AuditService,
    @Inject(DOSSIERS_CLOCK) private readonly clock: () => Date = () => new Date(),
    @Inject(DOSSIER_PDF_OPTIONS) private readonly pdfOptions: DossierPdfOptions = {},
  ) {}

  async export(auth: AuthContext, childId: number, request: RequestContext): Promise<DossierFile> {
    const estanciaId = this.requireEstancia(auth);
    const raw = await this.dossiers.load(childId, estanciaId);
    if (!raw) throw new ApiError('NO_ENCONTRADO', 'Infante no encontrado.');
    const content = this.toDocument(raw);
    const contentSha256 = createHash('sha256').update(canonicalJson(content)).digest();
    const contentHex = contentSha256.toString('hex');
    const issuedAt = this.clock();
    const folioOf = (id: number): string => dossierFolio(id, issuedAt.getUTCFullYear());
    const id = await this.dossiers.issue(
      { childId, estanciaId, userId: auth.userId, issuedAt, contentSha256 },
      (newId) => this.encryption.seal(sealMessage(folioOf(newId), childId, issuedAt, contentHex)),
      (tx, newId) =>
        this.audit.record(
          {
            userId: auth.userId,
            roleCode: auth.principal.assignments.map((assignment) => assignment.role).sort().join(',') || null,
            action: 'EXPEDIENTE_EXPORTADO',
            tableName: DOSSIERS_TABLE,
            recordId: String(newId),
            after: { folio: folioOf(newId), childId },
            request,
          },
          tx,
        ),
    );
    const folio = folioOf(id);
    const issued = await this.dossiers.findIssued(id);
    const sealHex = issued?.seal?.toString('hex') ?? '';
    const buffer = await buildDossierPdf(content, { folio, seal: sealHex, contentSha256: contentHex, issuedAt }, this.pdfOptions);
    return { filename: `expediente-${folio}.pdf`, buffer };
  }

  /** Comprueba folio y sello. No distingue un folio inexistente de un sello falso, y no revela datos del infante. */
  async verify(auth: AuthContext, input: VerifyDossierRequest, request: RequestContext): Promise<VerifyDossierResponse> {
    const result = await this.check(input);
    await this.audit.record({
      userId: auth.userId,
      roleCode: auth.principal.assignments.map((assignment) => assignment.role).sort().join(',') || null,
      action: 'EXPEDIENTE_VERIFICADO',
      tableName: DOSSIERS_TABLE,
      recordId: null,
      after: { folio: input.folio, valid: result.valid },
      request,
    });
    return result;
  }

  private async check(input: VerifyDossierRequest): Promise<VerifyDossierResponse> {
    const parsed = parseDossierFolio(input.folio);
    const issued = parsed ? await this.dossiers.findIssued(parsed.sequence) : null;
    if (!issued?.seal || dossierFolio(issued.id, issued.issuedAt.getUTCFullYear()) !== input.folio) return { valid: false };
    const recomputed = this.encryption.seal(sealMessage(input.folio, issued.childId, issued.issuedAt, issued.contentSha256.toString('hex')));
    const provided = Buffer.from(input.seal, 'hex');
    const authentic = sameBytes(provided, issued.seal) && sameBytes(recomputed, issued.seal);
    return authentic ? { valid: true, issuedAt: issued.issuedAt.toISOString(), originEstancia: issued.estanciaName } : { valid: false };
  }

  /** Descifra lo sensible y pasa las fechas a texto: es lo que se imprime y lo que cubre la huella. */
  private toDocument(raw: DossierRaw): DossierDocument {
    const decrypt = (blob: Buffer | null): string | null => (blob === null ? null : this.encryption.decrypt(blob));
    return {
      child: {
        enrollmentNumber: raw.child.enrollmentNumber,
        curp: raw.child.curp,
        fullName: join(raw.child.name, raw.child.paternalSurname, raw.child.maternalSurname),
        birthDate: raw.child.birthDate,
        gender: raw.child.gender,
        hasDisability: raw.child.hasDisability,
        disabilityGroup: decrypt(raw.child.disabilityGroupEncrypted),
        status: raw.child.status,
      },
      estancia: { code: raw.estancia.code, name: raw.estancia.name },
      enrollments: raw.enrollments,
      movements: raw.movements.map((movement) => ({ type: movement.type, occurredAt: movement.occurredAt.toISOString(), reason: movement.reason })),
      guardians: raw.guardians.map((guardian) => ({
        fullName: join(guardian.name, guardian.paternalSurname, guardian.maternalSurname),
        relationship: guardian.relationship,
        isPrimary: guardian.isPrimary,
        canPickUp: guardian.canPickUp,
        isEmergencyContact: guardian.isEmergencyContact,
        validFrom: guardian.validFrom,
        validUntil: guardian.validUntil,
        phone: decrypt(guardian.phoneEncrypted),
      })),
      consents: raw.consents.map((consent) => ({
        type: consent.type,
        noticeVersion: consent.noticeVersion,
        accepted: consent.accepted,
        acceptedAt: consent.acceptedAt.toISOString(),
        revokedAt: consent.revokedAt?.toISOString() ?? null,
      })),
      attendance: raw.attendance,
      followUps: raw.followUps.map((followUp) => ({
        absenceDate: followUp.absenceDate,
        absenceStatus: followUp.absenceStatus,
        status: followUp.status,
        cause: followUp.cause,
        expectedReturnDate: followUp.expectedReturnDate,
        requiresMedicalRelease: followUp.requiresMedicalRelease,
        openedAt: followUp.openedAt.toISOString(),
        closedAt: followUp.closedAt?.toISOString() ?? null,
        contacts: followUp.contacts.map((contact) => ({
          attemptNumber: contact.attemptNumber,
          occurredAt: contact.occurredAt.toISOString(),
          result: contact.result,
          guardianName: contact.guardianName,
          notes: decrypt(contact.notesEncrypted),
        })),
        release: followUp.release
          ? { dischargeDate: followUp.release.dischargeDate, folio: followUp.release.folio, observations: decrypt(followUp.release.observationsEncrypted) }
          : null,
      })),
    };
  }

  private requireEstancia(auth: AuthContext): number {
    if (auth.activeEstanciaId === null) throw new ApiError('FUERA_DE_ALCANCE', 'Selecciona una estancia activa.');
    return auth.activeEstanciaId;
  }
}
