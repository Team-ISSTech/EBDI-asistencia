import { beforeEach, describe, expect, it } from 'vitest';
import type { AuthContext } from '../../../common/auth/auth-context';
import { RecordingAudit, request } from '../../identity/__tests__/in-memory';
import { EnrollmentMovementsService } from '../services/enrollment-movements.service';
import { InMemoryChildren, InMemoryEnrollments, room } from './in-memory';

const directora: AuthContext = {
  sessionId: 1,
  userId: 10,
  principal: { userId: 10, assignments: [{ role: 'DIRECTORA', estanciaId: 1 }] },
  activeEstanciaId: 1,
};
const destinationDirectora: AuthContext = { ...directora, userId: 20, principal: { userId: 20, assignments: [{ role: 'DIRECTORA', estanciaId: 2 }] }, activeEstanciaId: 2 };

const now = new Date('2026-10-14T12:00:00Z');

describe('EnrollmentMovementsService (RF-35)', () => {
  let children: InMemoryChildren;
  let enrollments: InMemoryEnrollments;
  let audit: RecordingAudit;
  let service: EnrollmentMovementsService;
  let childId: number;

  beforeEach(async () => {
    children = new InMemoryChildren();
    children.rooms.set(1, room());
    children.rooms.set(2, room({ id: 2, name: 'Maternal B', minAgeMonths: 0, maxAgeMonths: 48, capacity: 1 }));
    children.rooms.set(3, room({ id: 3, estanciaId: 2, name: 'Destino A' }));
    enrollments = new InMemoryEnrollments(children);
    enrollments.estancias.set(1, { code: 'E1', name: 'Estancia 1', active: true });
    enrollments.estancias.set(2, { code: 'E2', name: 'Estancia 2', active: true });
    enrollments.estancias.set(3, { code: 'E3', name: 'Cerrada', active: false });
    audit = new RecordingAudit();
    service = new EnrollmentMovementsService(children, enrollments, audit.asService(), () => now);
    childId = await children.registerChild(
      { enrollmentNumber: 'M-1', curp: null, name: 'Infante', paternalSurname: 'Prueba', maternalSurname: null, birthDate: '2025-06-01', gender: null, hasDisability: false, disabilityGroupEncrypted: null },
      { estanciaId: 1, roomId: 1, schoolYearId: 1, startDate: '2026-10-01' },
      10,
      now,
    );
  });

  describe('cambio de sala', () => {
    it('mueve al infante y registra el movimiento con sala anterior y nueva', async () => {
      await service.move(directora, childId, { type: 'CAMBIO_SALA', roomId: 2, reason: 'Edad' }, request);
      expect(children.children.get(childId)?.roomId).toBe(2);
      expect(enrollments.movements[0]).toMatchObject({ type: 'CAMBIO_SALA', previousRoomId: 1, newRoomId: 2, reason: 'Edad' });
      expect(audit.entries[0]).toMatchObject({ action: 'INSCRIPCION_SALA_CAMBIADA', recordId: String(childId) });
      expect(audit.transactional).toBe(1);
    });

    it('rechaza la misma sala, una sala ajena, inactiva, llena o fuera del rango de edad', async () => {
      await expect(service.move(directora, childId, { type: 'CAMBIO_SALA', roomId: 1, reason: null }, request)).rejects.toMatchObject({ code: 'CONFLICTO' });
      await expect(service.move(directora, childId, { type: 'CAMBIO_SALA', roomId: 3, reason: null }, request)).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
      children.rooms.set(2, room({ id: 2, status: 'INACTIVO' }));
      await expect(service.move(directora, childId, { type: 'CAMBIO_SALA', roomId: 2, reason: null }, request)).rejects.toMatchObject({ code: 'CONFLICTO' });
      children.rooms.set(2, room({ id: 2, capacity: 0 }));
      await expect(service.move(directora, childId, { type: 'CAMBIO_SALA', roomId: 2, reason: null }, request)).rejects.toMatchObject({ code: 'CONFLICTO' });
      children.rooms.set(2, room({ id: 2, minAgeMonths: 36, maxAgeMonths: 48 }));
      await expect(service.move(directora, childId, { type: 'CAMBIO_SALA', roomId: 2, reason: null }, request)).rejects.toMatchObject({ code: 'DATOS_INVALIDOS' });
      expect(audit.entries).toHaveLength(0);
    });
  });

  describe('baja', () => {
    it('cierra la inscripción con su motivo y lo audita', async () => {
      await service.move(directora, childId, { type: 'BAJA', reason: 'Cambio de domicilio' }, request);
      expect(enrollments.finished).toEqual([{ childId, status: 'BAJA' }]);
      expect(enrollments.movements[0]).toMatchObject({ type: 'BAJA', previousRoomId: 1, newRoomId: null, reason: 'Cambio de domicilio' });
      expect(audit.entries[0]).toMatchObject({ action: 'INSCRIPCION_BAJA' });
    });

    it('un infante que ya no está activo, o de otra estancia, no se mueve', async () => {
      await service.move(directora, childId, { type: 'BAJA', reason: 'x' }, request);
      await expect(service.move(directora, childId, { type: 'BAJA', reason: 'otra vez' }, request)).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
    });

    it('otra estancia lo ve como inexistente', async () => {
      await expect(service.move(destinationDirectora, childId, { type: 'BAJA', reason: 'x' }, request)).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
    });
  });

  describe('traslado y recepción', () => {
    it('el traslado cierra la inscripción de origen como TRASLADADA y apunta a la estancia de destino', async () => {
      await service.move(directora, childId, { type: 'TRASLADO', destinationEstanciaId: 2, reason: 'Mudanza' }, request);
      expect(enrollments.finished).toEqual([{ childId, status: 'TRASLADADA' }]);
      expect(enrollments.movements[0]).toMatchObject({ type: 'TRASLADO', previousEstanciaId: 1, newEstanciaId: 2, reason: 'Mudanza' });
      expect(audit.entries[0]).toMatchObject({ action: 'TRASLADO_SOLICITADO' });
    });

    it('rechaza trasladar a la misma estancia, a una inexistente o a una cerrada', async () => {
      for (const destinationEstanciaId of [1, 99, 3]) {
        await expect(service.move(directora, childId, { type: 'TRASLADO', destinationEstanciaId, reason: 'x' }, request)).rejects.toMatchObject({ code: expect.stringMatching(/CONFLICTO|DATOS_INVALIDOS/) as string });
      }
      expect(audit.entries).toHaveLength(0);
    });

    it('lista los destinos posibles sin la estancia propia ni las cerradas', async () => {
      expect((await service.destinations(directora)).map((e) => e.id)).toEqual([2]);
    });

    const arrive = (id = 101) => {
      enrollments.pending.push({ enrollmentId: id, childId, childName: 'Infante Prueba', enrollmentNumber: 'M-1', birthDate: '2025-06-01', fromEstanciaId: 1, fromEstanciaName: 'Estancia 1', movedAt: now, reason: 'Mudanza' });
      enrollments.destinationOf.set(id, 2);
    };

    it('la estancia de destino ve sus traslados pendientes (y lo audita); el origen no', async () => {
      arrive();
      audit.entries.length = 0;
      expect((await service.pendingTransfers(destinationDirectora, request)).map((t) => t.enrollmentId)).toEqual([101]);
      expect(audit.entries[0]).toMatchObject({ action: 'TRASLADOS_CONSULTADOS' });
      expect(await service.pendingTransfers(directora, request)).toEqual([]);
    });

    it('recibe al infante en una sala del destino y registra el ALTA con la estancia de origen', async () => {
      arrive();
      audit.entries.length = 0;
      await service.receive(destinationDirectora, 101, { roomId: 3 }, request);
      expect(enrollments.movements[0]).toMatchObject({ type: 'ALTA', previousEstanciaId: 1, newEstanciaId: 2, newRoomId: 3 });
      expect(audit.entries[0]).toMatchObject({ action: 'TRASLADO_RECIBIDO' });
      expect(enrollments.pending).toHaveLength(0);
    });

    it('no recibe un traslado ajeno ni en una sala de otra estancia, y exige ciclo escolar activo', async () => {
      arrive();
      await expect(service.receive(directora, 101, { roomId: 1 }, request)).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
      await expect(service.receive(destinationDirectora, 101, { roomId: 1 }, request)).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
      children.schoolYearId = null;
      await expect(service.receive(destinationDirectora, 101, { roomId: 3 }, request)).rejects.toMatchObject({ code: 'CONFLICTO' });
    });
  });

  it('exige una estancia activa', async () => {
    await expect(service.move({ ...directora, activeEstanciaId: null }, childId, { type: 'BAJA', reason: 'x' }, request)).rejects.toMatchObject({ code: 'FUERA_DE_ALCANCE' });
  });
});
