import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { OfflineDb } from './db';
import { Outbox } from './outbox';
import { Vault } from './vault';

let counter = 0;
const NOW = new Date('2026-10-18T12:00:00Z').getTime();

const marksPayload = (enrollmentId = 1) => ({ journeyId: 3, marks: [{ enrollmentId, status: 'PRESENTE' as const, clientId: crypto.randomUUID(), method: 'MANUAL' as const }] });
const contactPayload = () => ({ followUpId: 9, contact: { result: 'SIN_RESPUESTA' as const, notes: 'Nota sensible' } });

describe('Outbox (RF-20 a RF-23)', () => {
  let db: OfflineDb;
  let outbox: Outbox;
  let clock = NOW;

  beforeEach(() => {
    clock = NOW;
    db = new OfflineDb(`outbox-test-${counter++}`);
    outbox = new Outbox(db, new Vault(db), () => clock);
  });
  afterEach(async () => {
    await db.delete();
  });

  describe('encolar', () => {
    it('guarda la operación con su UUID, quién la capturó, en qué estancia y cuándo', async () => {
      const id = await outbox.enqueue({ userId: 1, estanciaId: 7, type: 'ATTENDANCE_MARKS', payload: marksPayload() });
      expect(id).toMatch(/^[0-9a-f-]{36}$/);
      const row = await db.outbox.get(id);
      expect(row).toMatchObject({ userId: 1, estanciaId: 7, type: 'ATTENDANCE_MARKS', status: 'PENDIENTE', attempts: 0, nextRetryAt: null, capturedAt: new Date(NOW).toISOString() });
    });

    it('el contenido solo existe cifrado: ni las notas ni los ids se ven en lo guardado', async () => {
      const id = await outbox.enqueue({ userId: 1, estanciaId: 7, type: 'FOLLOW_UP_CONTACT', payload: contactPayload() });
      const row = await db.outbox.get(id);
      const stored = JSON.stringify(row, (_key, value: unknown) => (value instanceof Uint8Array ? Buffer.from(value).toString('latin1') : value));
      expect(stored).not.toContain('Nota sensible');
      expect(stored).not.toContain('SIN_RESPUESTA');
    });

    it('conserva la hora de captura indicada, y por defecto la actual', async () => {
      const at = new Date('2026-10-18T09:30:00Z');
      const id = await outbox.enqueue({ userId: 1, estanciaId: 7, type: 'ATTENDANCE_MARKS', payload: marksPayload(), capturedAt: at });
      expect((await db.outbox.get(id))?.capturedAt).toBe(at.toISOString());
    });
  });

  describe('lo que toca enviar', () => {
    it('devuelve las operaciones de la persona en el orden en que se capturaron, ya descifradas', async () => {
      const first = await outbox.enqueue({ userId: 1, estanciaId: 7, type: 'ATTENDANCE_MARKS', payload: marksPayload(1) });
      clock += 1000;
      const second = await outbox.enqueue({ userId: 1, estanciaId: 7, type: 'FOLLOW_UP_CONTACT', payload: contactPayload() });
      const due = await outbox.due(1, clock);
      expect(due.map((op) => op.operationId)).toEqual([first, second]);
      expect(due[0]).toMatchObject({ type: 'ATTENDANCE_MARKS', capturedAt: new Date(NOW).toISOString(), payload: { journeyId: 3 } });
      expect(due[1]).toMatchObject({ type: 'FOLLOW_UP_CONTACT', payload: { followUpId: 9, contact: { notes: 'Nota sensible' } } });
    });

    it('nunca entrega operaciones de otra persona: se enviarían con la sesión equivocada', async () => {
      await outbox.enqueue({ userId: 1, estanciaId: 7, type: 'ATTENDANCE_MARKS', payload: marksPayload() });
      await outbox.enqueue({ userId: 2, estanciaId: 7, type: 'ATTENDANCE_MARKS', payload: marksPayload() });
      expect(await outbox.due(1, clock)).toHaveLength(1);
      expect(await outbox.due(2, clock)).toHaveLength(1);
      expect(await outbox.due(3, clock)).toHaveLength(0);
    });

    it('respeta la espera de un reintento, salvo que se fuerce', async () => {
      const id = await outbox.enqueue({ userId: 1, estanciaId: 7, type: 'ATTENDANCE_MARKS', payload: marksPayload() });
      await outbox.scheduleRetry([id]);
      const row = await db.outbox.get(id);
      expect(row).toMatchObject({ attempts: 1, nextRetryAt: NOW + 5000 });
      expect(await outbox.due(1, NOW + 4999)).toHaveLength(0);
      expect(await outbox.due(1, NOW + 5000)).toHaveLength(1);
      expect(await outbox.due(1, NOW + 1, true)).toHaveLength(1);
    });

    it('la espera crece con cada intento fallido y tiene tope', async () => {
      const id = await outbox.enqueue({ userId: 1, estanciaId: 7, type: 'ATTENDANCE_MARKS', payload: marksPayload() });
      const waits: number[] = [];
      for (let i = 0; i < 8; i += 1) {
        await outbox.scheduleRetry([id]);
        waits.push(((await db.outbox.get(id))?.nextRetryAt ?? 0) - NOW);
      }
      expect(waits).toEqual([5000, 10000, 20000, 40000, 80000, 160000, 300000, 300000]);
    });

    it('lo rechazado o parcial no se vuelve a enviar solo', async () => {
      const id = await outbox.enqueue({ userId: 1, estanciaId: 7, type: 'ATTENDANCE_MARKS', payload: marksPayload() });
      await outbox.markForReview(id, 'RECHAZADA', { code: 'JORNADA_CERRADA', message: 'La jornada ya estaba cerrada.', rejections: [] });
      expect(await outbox.due(1, clock, true)).toHaveLength(0);
    });

    it('un contenido que no se puede descifrar (llave perdida) no tumba el envío del resto', async () => {
      const bad = await outbox.enqueue({ userId: 1, estanciaId: 7, type: 'ATTENDANCE_MARKS', payload: marksPayload(1) });
      await db.outbox.update(bad, { sealed: new Uint8Array([1, 2, 3]) });
      clock += 1000;
      const good = await outbox.enqueue({ userId: 1, estanciaId: 7, type: 'ATTENDANCE_MARKS', payload: marksPayload(2) });
      expect((await outbox.due(1, clock)).map((op) => op.operationId)).toEqual([good]);
      expect((await db.outbox.get(bad))?.status).toBe('RECHAZADA');
      expect((await db.outbox.get(bad))?.failure?.code).toBe('ILEGIBLE');
    });
  });

  describe('resultado del envío', () => {
    it('una operación aplicada sale de la cola', async () => {
      const id = await outbox.enqueue({ userId: 1, estanciaId: 7, type: 'ATTENDANCE_MARKS', payload: marksPayload() });
      await outbox.complete(id);
      expect(await db.outbox.count()).toBe(0);
    });

    it('lo rechazado queda guardado, con su motivo, para revisarlo y reconciliar', async () => {
      const id = await outbox.enqueue({ userId: 1, estanciaId: 7, type: 'ATTENDANCE_MARKS', payload: marksPayload() });
      await outbox.markForReview(id, 'PARCIAL', { code: null, message: null, rejections: [{ ref: 5, code: 'CANDADO_MEDICO', message: 'Requiere alta médica.' }] });
      const [item] = await outbox.review(1);
      expect(item).toMatchObject({ operationId: id, status: 'PARCIAL', type: 'ATTENDANCE_MARKS', failure: { rejections: [{ ref: 5, code: 'CANDADO_MEDICO' }] } });
      expect(item?.payload).toMatchObject({ journeyId: 3 });
    });

    it('descartar quita solo lo revisable de esa persona', async () => {
      const mine = await outbox.enqueue({ userId: 1, estanciaId: 7, type: 'ATTENDANCE_MARKS', payload: marksPayload() });
      const theirs = await outbox.enqueue({ userId: 2, estanciaId: 7, type: 'ATTENDANCE_MARKS', payload: marksPayload() });
      const pending = await outbox.enqueue({ userId: 1, estanciaId: 7, type: 'ATTENDANCE_MARKS', payload: marksPayload() });
      await outbox.markForReview(mine, 'RECHAZADA', { code: 'X', message: 'x', rejections: [] });
      await outbox.markForReview(theirs, 'RECHAZADA', { code: 'X', message: 'x', rejections: [] });
      expect(await outbox.discard(2, mine)).toBe(false);
      expect(await outbox.discard(1, pending)).toBe(false);
      expect(await outbox.discard(1, mine)).toBe(true);
      expect(await db.outbox.get(mine)).toBeUndefined();
      expect(await db.outbox.get(theirs)).toBeDefined();
      expect(await db.outbox.get(pending)).toBeDefined();
    });
  });

  describe('marcas de asistencia pendientes (para mostrarlas mientras no llegan)', () => {
    const marksOf = (journeyId: number, ...entries: Array<[number, 'PRESENTE' | 'FALTA_INJUSTIFICADA']>) => ({
      journeyId,
      marks: entries.map(([enrollmentId, status]) => ({ enrollmentId, status, clientId: crypto.randomUUID(), method: 'MANUAL' as const })),
    });

    it('devuelve el último estado capturado de cada infante en esa jornada', async () => {
      await outbox.enqueue({ userId: 1, estanciaId: 7, type: 'ATTENDANCE_MARKS', payload: marksOf(3, [1, 'PRESENTE'], [2, 'PRESENTE']) });
      clock += 1000;
      await outbox.enqueue({ userId: 1, estanciaId: 7, type: 'ATTENDANCE_MARKS', payload: marksOf(3, [2, 'FALTA_INJUSTIFICADA']) });
      expect([...(await outbox.pendingMarks(1, 3)).entries()]).toEqual([[1, 'PRESENTE'], [2, 'FALTA_INJUSTIFICADA']]);
    });

    it('solo de esa jornada, de esa persona y de lo que sigue pendiente', async () => {
      await outbox.enqueue({ userId: 1, estanciaId: 7, type: 'ATTENDANCE_MARKS', payload: marksOf(3, [1, 'PRESENTE']) });
      await outbox.enqueue({ userId: 1, estanciaId: 7, type: 'ATTENDANCE_MARKS', payload: marksOf(4, [8, 'PRESENTE']) });
      await outbox.enqueue({ userId: 2, estanciaId: 7, type: 'ATTENDANCE_MARKS', payload: marksOf(3, [9, 'PRESENTE']) });
      const rejected = await outbox.enqueue({ userId: 1, estanciaId: 7, type: 'ATTENDANCE_MARKS', payload: marksOf(3, [5, 'PRESENTE']) });
      await outbox.markForReview(rejected, 'RECHAZADA', { code: 'X', message: 'x', rejections: [] });
      await outbox.enqueue({ userId: 1, estanciaId: 7, type: 'FOLLOW_UP_CONTACT', payload: contactPayload() });
      expect([...(await outbox.pendingMarks(1, 3)).keys()]).toEqual([1]);
    });

    it('sin nada pendiente devuelve un mapa vacío', async () => {
      expect((await outbox.pendingMarks(1, 3)).size).toBe(0);
    });
  });

  describe('conteos', () => {
    it('separa lo pendiente, lo que hay que revisar y lo que es de otras personas', async () => {
      const a = await outbox.enqueue({ userId: 1, estanciaId: 7, type: 'ATTENDANCE_MARKS', payload: marksPayload() });
      await outbox.enqueue({ userId: 1, estanciaId: 7, type: 'ATTENDANCE_MARKS', payload: marksPayload() });
      const c = await outbox.enqueue({ userId: 1, estanciaId: 7, type: 'ATTENDANCE_MARKS', payload: marksPayload() });
      await outbox.enqueue({ userId: 2, estanciaId: 7, type: 'ATTENDANCE_MARKS', payload: marksPayload() });
      await outbox.markForReview(c, 'RECHAZADA', { code: 'X', message: 'x', rejections: [] });
      await outbox.complete(a);
      expect(await outbox.counts(1)).toEqual({ pending: 1, review: 1, others: 1 });
      expect(await outbox.counts(2)).toEqual({ pending: 1, review: 0, others: 2 });
    });
  });
});
