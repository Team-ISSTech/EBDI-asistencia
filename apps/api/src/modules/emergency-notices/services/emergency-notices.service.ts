import { Inject, Injectable } from '@nestjs/common';
import { afterFailedNotice } from '@sirai/domain';
import { AuditService } from '../../../common/audit/audit.service.js';
import { EncryptionService } from '../../../common/crypto/encryption.service.js';
import { MESSAGE_CHANNEL, type MessageChannel, type SendResult } from '../channels/message-channel.js';
import type { DueNotice, NoticeOutcome } from '../emergency-notices.types.js';
import { EMERGENCY_NOTICES_REPOSITORY, type EmergencyNoticesRepository } from '../repositories/emergency-notices.repository.js';

const NOTICES_TABLE = 'avisos_emergencia';
const SYSTEM_ROLE = 'SISTEMA';
const JOB_REQUEST = { ip: null, userAgent: 'job:avisos-emergencia', requestId: null } as const;
const BATCH_SIZE = 20;
const LEASE_MS = 300_000;
const PHONE_DIGITS = 10;
const COUNTRY_CODE = '52';

const skipped = (attempts: number, errorCode: string): NoticeOutcome => ({ status: 'SIN_TELEFONO', attempts, retryAt: null, externalMessageId: null, errorCode });

/**
 * RF-27: envía a los contactos de emergencia el aviso que dejó el segundo intento
 * fallido de localizar al tutor. El texto es fijo (plantilla del canal) y no nombra
 * al menor; el teléfono se descifra solo para enviar y nunca se guarda ni se audita.
 */
@Injectable()
export class EmergencyNoticesService {
  constructor(
    @Inject(EMERGENCY_NOTICES_REPOSITORY) private readonly notices: EmergencyNoticesRepository,
    @Inject(MESSAGE_CHANNEL) private readonly channel: MessageChannel,
    private readonly audit: AuditService,
    private readonly encryption: EncryptionService,
  ) {}

  /** Devuelve cuántos avisos procesó. Sin cuenta configurada no toca la cola: esperan a que haya canal. */
  async dispatchDue(now: Date): Promise<number> {
    if (!this.channel.enabled) return 0;
    const due = await this.notices.claimDue(now, BATCH_SIZE, LEASE_MS);
    for (const notice of due) await this.process(notice, now);
    return due.length;
  }

  private async process(notice: DueNotice, now: Date): Promise<void> {
    const outcome = await this.resolve(notice, now);
    await this.notices.settle(notice.id, outcome, now, (executor) =>
      this.audit.record(
        {
          userId: null,
          roleCode: SYSTEM_ROLE,
          action: outcome.status === 'ENVIADO' ? 'AVISO_EMERGENCIA_ENVIADO' : 'AVISO_EMERGENCIA_FALLIDO',
          tableName: NOTICES_TABLE,
          recordId: String(notice.id),
          after: { followUpId: notice.followUpId, guardianId: notice.guardianId, status: outcome.status, attempts: outcome.attempts, errorCode: outcome.errorCode },
          request: JOB_REQUEST,
        },
        executor,
      ),
    );
  }

  private async resolve(notice: DueNotice, now: Date): Promise<NoticeOutcome> {
    if (notice.phoneEncrypted === null) return skipped(notice.attempts, 'SIN_TELEFONO');
    const digits = this.encryption.decrypt(notice.phoneEncrypted);
    if (!new RegExp(`^\\d{${PHONE_DIGITS}}$`).test(digits)) return skipped(notice.attempts, 'TELEFONO_INVALIDO');
    const result = await this.send(`${COUNTRY_CODE}${digits}`);
    const attempts = notice.attempts + 1;
    if (result.ok) return { status: 'ENVIADO', attempts, retryAt: null, externalMessageId: result.messageId, errorCode: null };
    const next = afterFailedNotice(attempts, now);
    return { status: next.status, attempts, retryAt: next.retryAt, externalMessageId: null, errorCode: result.code };
  }

  /** El canal no debe lanzar, pero un fallo inesperado cuenta como intento fallido y no detiene a los demás avisos. */
  private async send(phone: string): Promise<SendResult> {
    try {
      return await this.channel.send(phone);
    } catch {
      return { ok: false, code: 'ERROR_INTERNO' };
    }
  }
}
