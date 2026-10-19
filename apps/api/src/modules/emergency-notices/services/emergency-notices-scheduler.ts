import { Inject, Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import type { ApiEnv } from '@sirai/config';
import { API_ENV } from '../../../common/config/config.module';
import { EmergencyNoticesService } from './emergency-notices.service.js';

const MS_PER_SECOND = 1000;

/**
 * Envía periódicamente los avisos de emergencia pendientes (RF-27). Con
 * `EMERGENCY_NOTICE_JOB_SECONDS=0` no se activa; en pruebas siempre está apagado
 * y se invoca el servicio de forma explícita.
 */
@Injectable()
export class EmergencyNoticesScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmergencyNoticesScheduler.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly notices: EmergencyNoticesService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  onModuleInit(): void {
    if (this.env.NODE_ENV === 'test' || this.env.EMERGENCY_NOTICE_JOB_SECONDS === 0) return;
    this.timer = setInterval(() => void this.tick(), this.env.EMERGENCY_NOTICE_JOB_SECONDS * MS_PER_SECOND);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Un fallo no detiene el proceso: la siguiente corrida reintenta lo pendiente. */
  async tick(now: Date = new Date()): Promise<void> {
    try {
      const processed = await this.notices.dispatchDue(now);
      if (processed > 0) this.logger.log(`Avisos de emergencia procesados: ${processed}`);
    } catch (error) {
      this.logger.error(`No se pudieron enviar los avisos de emergencia: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}
