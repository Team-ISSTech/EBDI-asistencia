import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { ApiEnv } from '@sirai/config';
import { API_ENV } from '../../../common/config/config.module';
import { FollowUpsGeneratorService } from './follow-ups-generator.service.js';

const MS_PER_SECOND = 1000;

/**
 * Revisa periódicamente si venció el cierre de alguna estancia (RF-24). Con
 * `FOLLOW_UP_JOB_SECONDS=0` no se activa. En pruebas siempre está apagado:
 * ahí se invoca el generador de forma explícita.
 */
@Injectable()
export class FollowUpsScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FollowUpsScheduler.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly generator: FollowUpsGeneratorService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  onModuleInit(): void {
    if (this.env.NODE_ENV === 'test' || this.env.FOLLOW_UP_JOB_SECONDS === 0) return;
    this.timer = setInterval(() => void this.tick(), this.env.FOLLOW_UP_JOB_SECONDS * MS_PER_SECOND);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Un fallo no detiene el proceso: la siguiente corrida reintenta lo pendiente. */
  async tick(now: Date = new Date()): Promise<void> {
    try {
      const created = await this.generator.generateDue(now);
      if (created > 0) this.logger.log(`Tickets de seguimiento abiertos: ${created}`);
    } catch (error) {
      this.logger.error(`No se pudieron generar los tickets de seguimiento: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
