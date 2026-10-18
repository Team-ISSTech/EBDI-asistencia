import type { TransactionHook } from '../../identity/repositories/repositories';
import type { NewSystem, SystemRecord } from '../integration.types';
import type { SystemsRepository } from '../repositories/systems.repository';

const executor = {} as Parameters<TransactionHook<unknown>>[0];

export class InMemorySystems implements SystemsRepository {
  readonly rows = new Map<number, SystemRecord>();
  readonly revokedBy: { id: number; userId: number }[] = [];
  private nextId = 1;

  async create(system: NewSystem, now: Date, inSameTransaction?: TransactionHook<number>): Promise<number> {
    const id = this.nextId++;
    this.rows.set(id, { id, name: system.name, clientId: system.clientId, secretHash: system.secretHash, scopes: system.scopes, status: 'ACTIVO', lastUsedAt: null, createdAt: now, revokedAt: null });
    await inSameTransaction?.(executor, id);
    return id;
  }

  list(): Promise<SystemRecord[]> {
    return Promise.resolve([...this.rows.values()]);
  }

  findById(id: number): Promise<SystemRecord | null> {
    return Promise.resolve(this.rows.get(id) ?? null);
  }

  findByClientId(clientId: string): Promise<SystemRecord | null> {
    return Promise.resolve([...this.rows.values()].find((row) => row.clientId === clientId) ?? null);
  }

  async revoke(id: number, userId: number, now: Date, inSameTransaction?: TransactionHook<void>): Promise<void> {
    const row = this.rows.get(id);
    if (row) this.rows.set(id, { ...row, status: 'REVOCADO', revokedAt: now });
    this.revokedBy.push({ id, userId });
    await inSameTransaction?.(executor, undefined);
  }

  touchLastUsed(id: number, now: Date): Promise<void> {
    const row = this.rows.get(id);
    if (row) this.rows.set(id, { ...row, lastUsedAt: now });
    return Promise.resolve();
  }
}
