export type SendResult = { readonly ok: true; readonly messageId: string } | { readonly ok: false; readonly code: string };

/** Canal por el que sale el aviso. El teléfono llega en formato internacional, solo dígitos. */
export interface MessageChannel {
  /** Falso mientras no haya cuenta configurada: el servicio no intenta enviar nada. */
  readonly enabled: boolean;
  send(phone: string): Promise<SendResult>;
}

export const MESSAGE_CHANNEL = Symbol('MESSAGE_CHANNEL');
