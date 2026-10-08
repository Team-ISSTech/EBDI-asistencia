import { Global, Module } from '@nestjs/common';
import { parseApiEnv } from '@sirai/config';

/** Token de inyección de la configuración validada (`ApiEnv`). */
export const API_ENV = Symbol('API_ENV');

/** Valida `process.env` una sola vez al arrancar y lo expone a toda la app. */
@Global()
@Module({
  providers: [{ provide: API_ENV, useFactory: () => parseApiEnv(process.env) }],
  exports: [API_ENV],
})
export class ConfigModule {}
