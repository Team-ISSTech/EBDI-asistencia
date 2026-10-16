import type { AuditExecutor } from '../../../common/audit/audit.service.js';
import type { DossierRaw, IssuedDossier } from '../dossiers.types.js';

export interface IssueInput {
  readonly childId: number;
  readonly estanciaId: number;
  readonly userId: number;
  readonly issuedAt: Date;
  readonly contentSha256: Buffer;
}

export interface DossiersRepository {
  /** Todo lo del infante para el expediente; null si no tiene inscripción activa en la estancia. */
  load(childId: number, estanciaId: number): Promise<DossierRaw | null>;
  /**
   * Registra la emisión, calcula el sello con el folio (el id) y sella el
   * registro, todo en una transacción junto con lo que haga `hook` (la auditoría).
   */
  issue(input: IssueInput, sealOf: (id: number) => Buffer, hook: (executor: AuditExecutor, id: number) => Promise<void>): Promise<number>;
  findIssued(id: number): Promise<IssuedDossier | null>;
}

export const DOSSIERS_REPOSITORY = Symbol('DOSSIERS_REPOSITORY');
