import { z } from 'zod';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError, apiRequest } from '../lib/api-client';

const jsonResponse = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('apiRequest', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('envía cookies, JSON y valida la respuesta con el esquema', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const result = await apiRequest('/x', { method: 'POST', body: { a: 1 }, schema: z.object({ ok: z.boolean() }) });
    expect(result).toEqual({ ok: true });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toMatch(/\/x$/);
    expect(init.credentials).toBe('include');
    expect(init.body).toBe('{"a":1}');
  });

  it('un GET no envía cuerpo ni content-type', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    await apiRequest('/x', { schema: z.object({ ok: z.boolean() }) });
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('GET');
    expect(init.body).toBeUndefined();
    expect(init.headers).toEqual({});
  });

  it('convierte el error de la API en ApiClientError con su código', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(403, { error: { code: 'SIN_PERMISO', message: 'No' } })));
    await expect(apiRequest('/x')).rejects.toMatchObject({ name: 'ApiClientError', status: 403, code: 'SIN_PERMISO' });
  });

  it('usa ERROR_INTERNO cuando el cuerpo de error no tiene el formato', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 502 })));
    await expect(apiRequest('/x')).rejects.toMatchObject({ code: 'ERROR_INTERNO' });
  });

  it('rechaza respuestas que no cumplen el contrato', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(200, { ok: 'sí' })));
    const error = await apiRequest('/x', { schema: z.object({ ok: z.boolean() }) }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiClientError);
    expect((error as ApiClientError).code).toBe('RESPUESTA_INVALIDA');
  });

  it('devuelve undefined en respuestas sin cuerpo (204)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(apiRequest('/x', { method: 'POST' })).resolves.toBeUndefined();
  });
});
