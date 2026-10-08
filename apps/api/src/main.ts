import { loadRootEnv } from './common/config/load-env';

loadRootEnv();

import { NestFactory } from '@nestjs/core';
import type { ApiEnv } from '@sirai/config';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { API_ENV } from './common/config/config.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  await app.listen(app.get<ApiEnv>(API_ENV).PORT);
}

void bootstrap();
