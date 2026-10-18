import type { IntegrationScope } from '@sirai/auth';

export type SystemStatus = 'ACTIVO' | 'REVOCADO';

/** Sistema externo tal como se guarda; `secretHash` nunca sale de la API. */
export interface SystemRecord {
  readonly id: number;
  readonly name: string;
  readonly clientId: string;
  readonly secretHash: string;
  readonly scopes: readonly IntegrationScope[];
  readonly status: SystemStatus;
  readonly lastUsedAt: Date | null;
  readonly createdAt: Date;
  readonly revokedAt: Date | null;
}

export interface NewSystem {
  readonly name: string;
  readonly clientId: string;
  readonly secretHash: string;
  readonly scopes: readonly IntegrationScope[];
  readonly createdBy: number;
}
