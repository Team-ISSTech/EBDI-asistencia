import type { TransactionHook } from '../../identity/repositories/repositories';
import type { NewSystem, SystemRecord } from '../integration.types';

export interface SystemsRepository {
  /** Alta del sistema y de lo que haga `inSameTransaction` (la auditoría). */
  create(system: NewSystem, now: Date, inSameTransaction?: TransactionHook<number>): Promise<number>;
  list(): Promise<SystemRecord[]>;
  findById(id: number): Promise<SystemRecord | null>;
  findByClientId(clientId: string): Promise<SystemRecord | null>;
  /** Marca como revocado (no borra) con quién y cuándo. */
  revoke(id: number, userId: number, now: Date, inSameTransaction?: TransactionHook<void>): Promise<void>;
  touchLastUsed(id: number, now: Date): Promise<void>;
}

export const SYSTEMS_REPOSITORY = Symbol('SYSTEMS_REPOSITORY');
