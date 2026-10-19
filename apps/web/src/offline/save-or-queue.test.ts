import { describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '../lib/api-client';
import { saveOrQueue, shouldQueue } from './save-or-queue';

describe('shouldQueue (RF-20, RF-23: no perder lo capturado)', () => {
  it.each([
    ['sin red', new TypeError('Failed to fetch')],
    ['tiempo agotado', new DOMException('Aborted', 'AbortError')],
    ['respuesta ilegible', new ApiClientError(200, 'RESPUESTA_INVALIDA', 'x')],
    ['500', new ApiClientError(500, 'ERROR_INTERNO', 'x')],
    ['502', new ApiClientError(502, 'ERROR_INTERNO', 'x')],
    ['503', new ApiClientError(503, 'ERROR_INTERNO', 'x')],
    ['408', new ApiClientError(408, 'ERROR_INTERNO', 'x')],
    ['429', new ApiClientError(429, 'DEMASIADAS_SOLICITUDES', 'x')],
    ['sesión vencida (401)', new ApiClientError(401, 'NO_AUTENTICADO', 'x')],
  ])('se guarda en la tablet: %s', (_name, error) => {
    expect(shouldQueue(error)).toBe(true);
  });

  it.each([
    ['400', new ApiClientError(400, 'DATOS_INVALIDOS', 'x')],
    ['403', new ApiClientError(403, 'SIN_PERMISO', 'x')],
    ['404', new ApiClientError(404, 'NO_ENCONTRADO', 'x')],
    ['409', new ApiClientError(409, 'CONFLICTO', 'x')],
  ])('un rechazo definitivo del servidor no se guarda: %s', (_name, error) => {
    expect(shouldQueue(error)).toBe(false);
  });
});

describe('saveOrQueue', () => {
  it('con éxito devuelve el resultado y no encola', async () => {
    const queue = vi.fn().mockResolvedValue('op-1');
    await expect(saveOrQueue(() => Promise.resolve(42), queue)).resolves.toEqual({ queued: false, value: 42 });
    expect(queue).not.toHaveBeenCalled();
  });

  it('si falla por la red, encola y lo dice', async () => {
    const queue = vi.fn().mockResolvedValue('op-1');
    await expect(saveOrQueue(() => Promise.reject(new TypeError('Failed to fetch')), queue)).resolves.toEqual({ queued: true });
    expect(queue).toHaveBeenCalledTimes(1);
  });

  it('un rechazo definitivo se propaga tal cual y no encola', async () => {
    const queue = vi.fn().mockResolvedValue('op-1');
    const rejection = new ApiClientError(409, 'CONFLICTO', 'La jornada ya está cerrada.');
    await expect(saveOrQueue(() => Promise.reject(rejection), queue)).rejects.toBe(rejection);
    expect(queue).not.toHaveBeenCalled();
  });

  it('sin forma de encolar (sin la cola local) se comporta como siempre: propaga el error', async () => {
    const failure = new TypeError('Failed to fetch');
    await expect(saveOrQueue(() => Promise.reject(failure), null)).rejects.toBe(failure);
  });

  it('si ni la tablet puede guardarlo, el error que se ve es el de guardar, no el de la red', async () => {
    const storage = new Error('IndexedDB no disponible');
    await expect(saveOrQueue(() => Promise.reject(new TypeError('Failed to fetch')), () => Promise.reject(storage))).rejects.toBe(storage);
  });
});
