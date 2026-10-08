import { Global, Module } from '@nestjs/common';
import { EncryptionService } from '../crypto/encryption.service';
import { AuditService } from './audit.service';

@Global()
@Module({
  providers: [EncryptionService, AuditService],
  exports: [EncryptionService, AuditService],
})
export class AuditModule {}
