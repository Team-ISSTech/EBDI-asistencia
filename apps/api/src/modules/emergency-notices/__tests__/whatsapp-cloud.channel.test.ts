import { describe, expect, it, vi } from 'vitest';
import type { ApiEnv } from '@sirai/config';
import { WhatsAppCloudChannel } from '../channels/whatsapp-cloud.channel.js';

const env = {
  WHATSAPP_PHONE_NUMBER_ID: '109876',
  WHATSAPP_ACCESS_TOKEN: 'token-secreto',
  WHATSAPP_TEMPLATE_NAME: 'aviso_urgente_sirai',
  WHATSAPP_TEMPLATE_LANGUAGE: 'es_MX',
  WHATSAPP_API_VERSION: 'v21.0',
} as ApiEnv;

const reply = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('WhatsAppCloudChannel', () => {
  it('sin número o token queda apagado y no llama a la red', async () => {
    const fetchFn = vi.fn();
    const channel = new WhatsAppCloudChannel({ ...env, WHATSAPP_ACCESS_TOKEN: undefined }, fetchFn);
    expect(channel.enabled).toBe(false);
    expect(await channel.send('525512345678')).toEqual({ ok: false, code: 'CANAL_APAGADO' });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('manda la plantilla aprobada, sin variables, con el token en el encabezado', async () => {
    const fetchFn = vi.fn().mockResolvedValue(reply(200, { messages: [{ id: 'wamid.ABC' }] }));
    const channel = new WhatsAppCloudChannel(env, fetchFn);
    expect(channel.enabled).toBe(true);
    expect(await channel.send('525512345678')).toEqual({ ok: true, messageId: 'wamid.ABC' });
    const [url, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v21.0/109876/messages');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer token-secreto');
    expect(JSON.parse(init.body as string)).toEqual({
      messaging_product: 'whatsapp',
      to: '525512345678',
      type: 'template',
      template: { name: 'aviso_urgente_sirai', language: { code: 'es_MX' } },
    });
  });

  it('un error de la API devuelve solo su código, nunca el mensaje (puede incluir el número)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(reply(400, { error: { code: 131026, message: 'Message undeliverable: 525512345678' } }));
    const result = await new WhatsAppCloudChannel(env, fetchFn).send('525512345678');
    expect(result).toEqual({ ok: false, code: 'WHATSAPP_131026' });
  });

  it('una respuesta sin código ni identificador cuenta como error de respuesta', async () => {
    const noMessage = new WhatsAppCloudChannel(env, vi.fn().mockResolvedValue(reply(200, {})));
    expect(await noMessage.send('525512345678')).toEqual({ ok: false, code: 'RESPUESTA_INVALIDA' });
    const bareError = new WhatsAppCloudChannel(env, vi.fn().mockResolvedValue(reply(502, 'bad gateway')));
    expect(await bareError.send('525512345678')).toEqual({ ok: false, code: 'HTTP_502' });
  });

  it('si la red falla devuelve SIN_RESPUESTA sin lanzar', async () => {
    const channel = new WhatsAppCloudChannel(env, vi.fn().mockRejectedValue(new Error('ECONNRESET')));
    expect(await channel.send('525512345678')).toEqual({ ok: false, code: 'SIN_RESPUESTA' });
  });
});
