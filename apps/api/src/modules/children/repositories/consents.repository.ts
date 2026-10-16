import type { TransactionHook } from '../../identity/repositories/repositories';
import type { ConsentRecord, NewConsent } from '../children.types';

export interface ConsentsRepository {
  /** Historial completo del infante, el más reciente primero. */
  listForChild(childId: number): Promise<ConsentRecord[]>;
  findById(id: number): Promise<ConsentRecord | null>;
  create(consent: NewConsent, now: Date, userId: number, inSameTransaction?: TransactionHook<number>): Promise<number>;
  /** Marca `revocado_at`; nunca borra la fila. */
  revoke(id: number, at: Date, inSameTransaction?: TransactionHook<void>): Promise<void>;
}

export const CONSENTS_REPOSITORY = Symbol('CONSENTS_REPOSITORY');
