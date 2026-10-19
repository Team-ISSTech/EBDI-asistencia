import { Module } from '@nestjs/common';
import type { ApiEnv } from '@sirai/config';
import { API_ENV } from '../../common/config/config.module';
import { MESSAGE_CHANNEL } from './channels/message-channel.js';
import { WhatsAppCloudChannel } from './channels/whatsapp-cloud.channel.js';
import { DrizzleEmergencyNoticesRepository } from './repositories/drizzle-emergency-notices.repository.js';
import { EMERGENCY_NOTICES_REPOSITORY } from './repositories/emergency-notices.repository.js';
import { EmergencyNoticesScheduler } from './services/emergency-notices-scheduler.js';
import { EmergencyNoticesService } from './services/emergency-notices.service.js';

@Module({
  providers: [
    { provide: EMERGENCY_NOTICES_REPOSITORY, useClass: DrizzleEmergencyNoticesRepository },
    { provide: MESSAGE_CHANNEL, useFactory: (env: ApiEnv) => new WhatsAppCloudChannel(env), inject: [API_ENV] },
    EmergencyNoticesService,
    EmergencyNoticesScheduler,
  ],
  exports: [EmergencyNoticesService],
})
export class EmergencyNoticesModule {}
