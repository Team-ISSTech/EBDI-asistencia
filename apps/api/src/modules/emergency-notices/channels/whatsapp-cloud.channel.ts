import type { ApiEnv } from '@sirai/config';
import type { MessageChannel, SendResult } from './message-channel.js';

const GRAPH_URL = 'https://graph.facebook.com';
const TIMEOUT_MS = 10_000;

type FetchFn = (url: string, init: RequestInit) => Promise<Response>;
type WhatsAppEnv = Pick<ApiEnv, 'WHATSAPP_PHONE_NUMBER_ID' | 'WHATSAPP_ACCESS_TOKEN' | 'WHATSAPP_TEMPLATE_NAME' | 'WHATSAPP_TEMPLATE_LANGUAGE' | 'WHATSAPP_API_VERSION'>;

const readJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const errorCode = (status: number, body: unknown): string => {
  const code = (body as { error?: { code?: unknown } } | null)?.error?.code;
  return typeof code === 'number' || typeof code === 'string' ? `WHATSAPP_${code}` : `HTTP_${status}`;
};

/**
 * WhatsApp Business (Cloud API de Meta). Un aviso iniciado por la estancia solo
 * puede salir como plantilla aprobada, así que se manda la plantilla configurada,
 * cuyo texto es `EMERGENCY_NOTICE_TEXT`. De los errores se conserva únicamente el
 * código: el mensaje de Meta puede repetir el número de teléfono.
 */
export class WhatsAppCloudChannel implements MessageChannel {
  constructor(
    private readonly env: WhatsAppEnv,
    private readonly fetchFn: FetchFn = (url, init) => fetch(url, init),
  ) {}

  get enabled(): boolean {
    return this.env.WHATSAPP_PHONE_NUMBER_ID !== undefined && this.env.WHATSAPP_ACCESS_TOKEN !== undefined;
  }

  async send(phone: string): Promise<SendResult> {
    const { WHATSAPP_PHONE_NUMBER_ID: phoneNumberId, WHATSAPP_ACCESS_TOKEN: token } = this.env;
    if (phoneNumberId === undefined || token === undefined) return { ok: false, code: 'CANAL_APAGADO' };
    try {
      const response = await this.fetchFn(`${GRAPH_URL}/${this.env.WHATSAPP_API_VERSION}/${phoneNumberId}/messages`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: phone,
          type: 'template',
          template: { name: this.env.WHATSAPP_TEMPLATE_NAME, language: { code: this.env.WHATSAPP_TEMPLATE_LANGUAGE } },
        }),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const body = await readJson(response);
      if (!response.ok) return { ok: false, code: errorCode(response.status, body) };
      const id = (body as { messages?: Array<{ id?: unknown }> } | null)?.messages?.[0]?.id;
      return typeof id === 'string' ? { ok: true, messageId: id } : { ok: false, code: 'RESPUESTA_INVALIDA' };
    } catch {
      return { ok: false, code: 'SIN_RESPUESTA' };
    }
  }
}
