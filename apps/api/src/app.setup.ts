import type { INestApplication } from '@nestjs/common';
import type { ApiEnv } from '@sirai/config';
import cookieParser from 'cookie-parser';
import type { Express } from 'express';
import { API_ENV } from './common/config/config.module';
import { requestIdMiddleware } from './common/http/request-id.middleware';

/** Middleware y CORS compartidos por `main.ts` y las pruebas de integración. */
export function configureApp(app: INestApplication): void {
  const env = app.get<ApiEnv>(API_ENV);
  if (env.TRUST_PROXY) {
    // Sin esto, detrás de un proxy todas las peticiones comparten la IP del proxy
    // y el límite de login y la auditoría registrarían siempre la misma dirección.
    (app.getHttpAdapter().getInstance() as Express).set('trust proxy', 1);
  }
  app.use(cookieParser());
  app.use(requestIdMiddleware);
  app.enableCors({ origin: env.WEB_ORIGIN, credentials: true });
  app.enableShutdownHooks();
}
