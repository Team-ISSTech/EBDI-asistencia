import { Controller, Get, Inject } from '@nestjs/common';
import type { HealthResponse } from '@sirai/contracts';
import { type Db } from '@sirai/db';
import { sql } from 'drizzle-orm';
import { Public } from '../../common/auth/decorators';
import { DB } from '../../common/database/database.module';

/** Estado de la API y de su conexión a la base de datos. */
@Controller('health')
export class HealthController {
  constructor(@Inject(DB) private readonly db: Db) {}

  @Public()
  @Get()
  async check(): Promise<HealthResponse> {
    const db = await this.db
      .execute(sql`SELECT 1`)
      .then(() => 'up' as const)
      .catch(() => 'down' as const);
    return { status: 'ok', db, uptimeSeconds: Math.floor(process.uptime()) };
  }
}
