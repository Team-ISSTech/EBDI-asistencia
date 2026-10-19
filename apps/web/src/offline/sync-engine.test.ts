import 'fake-indexeddb/auto';
import type { SyncOperation, SyncResponse } from '@sirai/contracts';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '../lib/api-client';
import { OfflineDb } from './db';
import { Outbox } from './outbox';
import { SyncEngine } from './sync-engine';
import { Vault } from './vault';

let counter = 0;
const NOW = new Date('2026-10-18T12:00:00Z').getTime();
const marks = (n = 1) => ({ journeyId: 3, marks: [{ enrollmentId: n, status: 'PRESENTE' as const, clientId: crypto.randomUUID(), method: 'MANUAL' as const }] });

const result = (operationId: string, overrides: Partial<SyncResponse['results'][number]> = {}): SyncResponse['results'][number] => ({
  operationId,
  status: 'APLICADA',
  replayed: false,
  saved: 1,
  unchanged: 0,
  rejections: [],
  code: null,
  message: null,
  ...overrides,
});

describe('SyncEngine (RF-21 a RF-23)', () => {
  let db: OfflineDb;
  let outbox: Outbox;
  let clock = NOW;
  let send: ReturnType<typeof vi.fn<(operations: SyncOperation[]) => Promise<SyncResponse>>>;
  let engine: SyncEngine;

  const enqueue = (n = 1, userId = 1) => outbox.enqueue({ userId, estanciaId: 7, type: 'ATTENDANCE_MARKS', payload: marks(n) });
  const allApplied = (operations: SyncOperation[]): SyncResponse => ({ results: operations.map((operation) => result(operation.operationId)) });

  beforeEach(() => {
    clock = NOW;
    db = new OfflineDb(`engine-test-${counter++}`);
    outbox = new Outbox(db, new Vault(db), () => clock);
    send = vi.fn((operations: SyncOperation[]) => Promise.resolve(allApplied(operations)));
    engine = new SyncEngine(outbox, send, () => clock);
  });
  afterEach(async () => {
    await db.delete();
  });

  it('envía lo pendiente en el orden de captura y saca de la cola lo aplicado', async () => {
    const [a, b] = [await enqueue(1), await (async () => { clock += 1000; return enqueue(2); })()];
    const outcome = await engine.flush(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0]?.[0].map((op) => op.operationId)).toEqual([a, b]);
    expect(outcome).toEqual({ sent: 2, applied: 2, review: 0, stopped: null });
    expect(await db.outbox.count()).toBe(0);
  });

  it('sin nada pendiente no llama al servidor', async () => {
    expect(await engine.flush(1)).toEqual({ sent: 0, applied: 0, review: 0, stopped: null });
    expect(send).not.toHaveBeenCalled();
  });

  it('manda lotes de 50 como máximo, en orden, hasta vaciar la cola', async () => {
    for (let i = 0; i < 120; i += 1) {
      clock += 1;
      await enqueue(i + 1);
    }
    const outcome = await engine.flush(1);
    expect(send.mock.calls.map(([operations]) => operations.length)).toEqual([50, 50, 20]);
    expect(outcome).toMatchObject({ sent: 120, applied: 120, stopped: null });
    expect(await db.outbox.count()).toBe(0);
  });

  it('un reintento reconocido por el servidor (replayed) cuenta como aplicado', async () => {
    const id = await enqueue();
    send.mockResolvedValueOnce({ results: [result(id, { replayed: true, saved: 0, unchanged: 1 })] });
    expect(await engine.flush(1)).toMatchObject({ applied: 1 });
    expect(await db.outbox.count()).toBe(0);
  });

  describe('lo que el servidor rechaza no se pierde', () => {
    it('una operación parcial queda para revisar, con lo que no se aplicó', async () => {
      const id = await enqueue();
      send.mockResolvedValueOnce({ results: [result(id, { status: 'PARCIAL', rejections: [{ ref: 5, code: 'CANDADO_MEDICO', message: 'Requiere alta médica.' }] })] });
      expect(await engine.flush(1)).toMatchObject({ applied: 0, review: 1 });
      const [item] = await outbox.review(1);
      expect(item).toMatchObject({ operationId: id, status: 'PARCIAL', failure: { rejections: [{ ref: 5, code: 'CANDADO_MEDICO' }] } });
    });

    it('una operación rechazada completa queda para revisar, con su motivo, y no se reenvía sola', async () => {
      const id = await enqueue();
      send.mockResolvedValueOnce({ results: [result(id, { status: 'RECHAZADA', saved: 0, code: 'JORNADA_CERRADA', message: 'La jornada ya estaba cerrada.' })] });
      await engine.flush(1);
      expect((await outbox.review(1))[0]).toMatchObject({ status: 'RECHAZADA', failure: { code: 'JORNADA_CERRADA', message: 'La jornada ya estaba cerrada.' } });
      send.mockClear();
      await engine.flush(1, { force: true });
      expect(send).not.toHaveBeenCalled();
    });

    it('lo rechazado de una operación no frena las demás del lote', async () => {
      const [a, b] = [await enqueue(1), await enqueue(2)];
      send.mockResolvedValueOnce({ results: [result(a, { status: 'RECHAZADA', saved: 0, code: 'X', message: 'x' }), result(b)] });
      expect(await engine.flush(1)).toMatchObject({ applied: 1, review: 1 });
      expect(await db.outbox.count()).toBe(1);
    });
  });

  describe('fallas de red o del servidor: se conserva todo y se reintenta con espera', () => {
    it.each([
      ['sin red (TypeError)', () => new TypeError('Failed to fetch')],
      ['500', () => new ApiClientError(500, 'ERROR_INTERNO', 'x')],
      ['503', () => new ApiClientError(503, 'ERROR_INTERNO', 'x')],
      ['429', () => new ApiClientError(429, 'DEMASIADAS_SOLICITUDES', 'x')],
      ['408', () => new ApiClientError(408, 'ERROR_INTERNO', 'x')],
      ['respuesta inválida', () => new ApiClientError(200, 'RESPUESTA_INVALIDA', 'x')],
    ])('%s', async (_name, failure) => {
      const id = await enqueue();
      send.mockRejectedValueOnce(failure());
      expect(await engine.flush(1)).toEqual({ sent: 1, applied: 0, review: 0, stopped: 'NETWORK' });
      expect(await db.outbox.get(id)).toMatchObject({ status: 'PENDIENTE', attempts: 1, nextRetryAt: NOW + 5000 });
    });

    it('antes de que pase la espera no vuelve a intentar; con `force` sí; al pasar, sí', async () => {
      const id = await enqueue();
      send.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      await engine.flush(1);
      send.mockClear();
      expect(await engine.flush(1)).toMatchObject({ sent: 0 });
      expect(send).not.toHaveBeenCalled();
      clock = NOW + 5000;
      expect(await engine.flush(1)).toMatchObject({ applied: 1 });
      expect(await db.outbox.get(id)).toBeUndefined();
    });

    it('`force` ignora la espera (por ejemplo "Enviar ahora")', async () => {
      await enqueue();
      send.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      await engine.flush(1);
      expect(await engine.flush(1, { force: true })).toMatchObject({ applied: 1 });
    });

    it('al fallar no sigue con los demás lotes', async () => {
      for (let i = 0; i < 60; i += 1) {
        clock += 1;
        await enqueue(i + 1);
      }
      send.mockRejectedValueOnce(new TypeError('Failed to fetch'));
      expect(await engine.flush(1)).toMatchObject({ stopped: 'NETWORK' });
      expect(send).toHaveBeenCalledTimes(1);
      expect(await db.outbox.count()).toBe(60);
    });

    it('si el servidor no contesta por alguna operación, esa se reintenta y no se pierde', async () => {
      const [a, b] = [await enqueue(1), await enqueue(2)];
      send.mockResolvedValueOnce({ results: [result(a)] });
      expect(await engine.flush(1)).toMatchObject({ applied: 1 });
      expect(await db.outbox.get(b)).toMatchObject({ status: 'PENDIENTE', attempts: 1 });
    });
  });

  describe('la sesión', () => {
    it('un 401 detiene el envío sin tocar la cola: hay que iniciar sesión otra vez', async () => {
      const id = await enqueue();
      send.mockRejectedValueOnce(new ApiClientError(401, 'NO_AUTENTICADO', 'x'));
      expect(await engine.flush(1)).toEqual({ sent: 1, applied: 0, review: 0, stopped: 'SESSION' });
      expect(await db.outbox.get(id)).toMatchObject({ status: 'PENDIENTE', attempts: 0, nextRetryAt: null });
    });

    it('solo envía lo de la persona con sesión', async () => {
      await enqueue(1, 1);
      await enqueue(2, 2);
      await engine.flush(1);
      expect(send.mock.calls[0]?.[0]).toHaveLength(1);
      expect(await db.outbox.where('userId').equals(2).count()).toBe(1);
    });
  });

  describe('datos que el servidor no acepta', () => {
    it('un 400 rechaza ese lote para revisarlo, en vez de reintentarlo para siempre, y sigue con el resto', async () => {
      const [a, b] = [await enqueue(1), await enqueue(2)];
      send.mockRejectedValueOnce(new ApiClientError(400, 'DATOS_INVALIDOS', 'Datos inválidos.'));
      const outcome = await engine.flush(1);
      expect(outcome).toMatchObject({ review: 2, stopped: null });
      expect(await db.outbox.get(a)).toMatchObject({ status: 'RECHAZADA', failure: { code: 'DATOS_INVALIDOS', message: 'Datos inválidos.' } });
      expect(await db.outbox.get(b)).toMatchObject({ status: 'RECHAZADA' });
    });

    it('un 403 también es un rechazo, no una falla pasajera', async () => {
      const id = await enqueue();
      send.mockRejectedValueOnce(new ApiClientError(403, 'SIN_PERMISO', 'Sin permiso.'));
      expect(await engine.flush(1)).toMatchObject({ review: 1, stopped: null });
      expect((await db.outbox.get(id))?.status).toBe('RECHAZADA');
    });
  });

  it('dos envíos a la vez no duplican nada: el segundo espera al primero', async () => {
    await enqueue();
    let release: () => void = () => undefined;
    send.mockImplementationOnce(
      (operations) =>
        new Promise<SyncResponse>((resolve) => {
          release = () => resolve(allApplied(operations));
        }),
    );
    const first = engine.flush(1);
    const second = engine.flush(1);
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    release();
    const [one, two] = await Promise.all([first, second]);
    expect(send).toHaveBeenCalledTimes(1);
    expect(one).toEqual(two);
    expect(one).toMatchObject({ applied: 1 });
  });
});
