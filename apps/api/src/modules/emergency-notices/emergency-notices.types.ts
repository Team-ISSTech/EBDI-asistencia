import type { EmergencyNoticeStatus } from '@sirai/domain';

/** Aviso listo para enviarse; el teléfono sigue cifrado hasta el momento de mandarlo. */
export interface DueNotice {
  readonly id: number;
  readonly followUpId: number;
  readonly guardianId: number;
  readonly attempts: number;
  readonly phoneEncrypted: Buffer | null;
}

/** Resultado de un intento de envío ya resuelto por el servicio. */
export interface NoticeOutcome {
  readonly status: EmergencyNoticeStatus;
  readonly attempts: number;
  readonly retryAt: Date | null;
  readonly externalMessageId: string | null;
  readonly errorCode: string | null;
}
