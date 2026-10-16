import type { TransactionHook } from '../../identity/repositories/repositories';
import type { ChildGuardianRecord, GuardianRecord, NewChildGuardian, NewGuardian } from '../children.types';

export interface GuardiansRepository {
  /** Alta del tutor y de lo que haga `inSameTransaction` (la auditoría). */
  create(guardian: NewGuardian, now: Date, inSameTransaction?: TransactionHook<number>): Promise<number>;
  findById(id: number): Promise<GuardianRecord | null>;
  /** Tutores del infante con vínculo vigente y sin borrado lógico. */
  listForChild(childId: number): Promise<ChildGuardianRecord[]>;
  /** Lanza CONFLICTO si el vínculo ya existe. */
  link(childId: number, link: NewChildGuardian, now: Date, inSameTransaction?: TransactionHook<void>): Promise<void>;
  /** ¿Está el tutor vinculado a algún infante con inscripción activa en la estancia? */
  isLinkedInEstancia(guardianId: number, estanciaId: number): Promise<boolean>;
  findPhoneEncrypted(guardianId: number): Promise<Buffer | null>;
}

export const GUARDIANS_REPOSITORY = Symbol('GUARDIANS_REPOSITORY');
