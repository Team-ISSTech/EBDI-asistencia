import { Inject, Injectable } from '@nestjs/common';
import { schema, type Db } from '@sirai/db';
import { and, eq, isNull } from 'drizzle-orm';
import { DB } from '../../../common/database/database.module';
import type { EstanciaSummaryRecord } from '../identity.types';
import type { EstanciasRepository } from './repositories';

const { estancias } = schema;
const ACTIVE = 'ACTIVA';

@Injectable()
export class DrizzleEstanciasRepository implements EstanciasRepository {
  constructor(@Inject(DB) private readonly db: Db) {}

  async findById(id: number): Promise<EstanciaSummaryRecord | null> {
    const [row] = await this.db
      .select({ id: estancias.id, name: estancias.name })
      .from(estancias)
      .where(and(eq(estancias.id, id), eq(estancias.status, ACTIVE), isNull(estancias.deletedAt)));
    return row ?? null;
  }

  listActive(): Promise<EstanciaSummaryRecord[]> {
    return this.db
      .select({ id: estancias.id, name: estancias.name })
      .from(estancias)
      .where(and(eq(estancias.status, ACTIVE), isNull(estancias.deletedAt)))
      .orderBy(estancias.name);
  }
}
