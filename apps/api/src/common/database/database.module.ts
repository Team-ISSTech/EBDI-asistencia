import { Global, Inject, Module, type OnModuleDestroy } from '@nestjs/common';
import type { ApiEnv } from '@sirai/config';
import { connect, type DbConnection } from '@sirai/db';
import { API_ENV } from '../config/config.module';

/** Token del cliente Drizzle (`Db`). Solo los repositorios lo inyectan. */
export const DB = Symbol('DB');
const DB_CONNECTION = Symbol('DB_CONNECTION');

@Global()
@Module({
  providers: [
    {
      provide: DB_CONNECTION,
      inject: [API_ENV],
      useFactory: (env: ApiEnv) => connect(env.DATABASE_URL, { poolSize: env.DB_POOL_SIZE }),
    },
    {
      provide: DB,
      inject: [DB_CONNECTION],
      useFactory: (connection: DbConnection) => connection.db,
    },
  ],
  exports: [DB],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor(@Inject(DB_CONNECTION) private readonly connection: DbConnection) {}

  async onModuleDestroy(): Promise<void> {
    await this.connection.close();
  }
}
