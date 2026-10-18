import { beforeEach, describe, expect, it } from 'vitest';
import type { AuthContext } from '../../../common/auth/auth-context';
import { EncryptionService } from '../../../common/crypto/encryption.service';
import { RecordingAudit, request, testEnv } from '../../identity/__tests__/in-memory';
import { ChildrenService } from '../services/children.service';
import { InMemoryChildren, room } from './in-memory';

const directora: AuthContext = {
  sessionId: 1,
  userId: 10,
  principal: { userId: 10, assignments: [{ role: 'DIRECTORA', estanciaId: 1 }] },
  activeEstanciaId: 1,
};

const input = {
  enrollmentNumber: 'M-0001',
  curp: null,
  name: 'Infante',
  paternalSurname: 'Prueba',
  maternalSurname: null,
  birthDate: '2025-01-10',
  gender: null,
  hasDisability: false,
  disabilityGroup: null,
  roomId: 1,
};

describe('ChildrenService: editar y eliminar (RF-33)', () => {
  let repo: InMemoryChildren;
  let audit: RecordingAudit;
  let encryption: EncryptionService;
  let service: ChildrenService;
  let childId: number;

  beforeEach(async () => {
    repo = new InMemoryChildren();
    repo.rooms.set(1, room());
    audit = new RecordingAudit();
    encryption = new EncryptionService(testEnv);
    service = new ChildrenService(repo, encryption, audit.asService(), () => new Date('2026-10-14T12:00:00Z'));
    childId = (await service.enroll(directora, input, request)).id;
    audit.entries.length = 0;
    audit.transactional = 0;
  });

  it('actualiza solo lo que llega, deja la matrícula intacta y audita los campos cambiados', async () => {
    const updated = await service.update(directora, childId, { name: 'Ana', maternalSurname: 'López' }, request);
    expect(updated).toMatchObject({ name: 'Ana', maternalSurname: 'López', paternalSurname: 'Prueba', enrollmentNumber: 'M-0001' });
    expect(audit.entries[0]).toMatchObject({ action: 'INFANTE_ACTUALIZADO', recordId: String(childId), after: { fields: ['name', 'maternalSurname'] } });
    expect(audit.transactional).toBe(1);
  });

  it('cifra el grupo de discapacidad nuevo y no lo manda a la bitácora', async () => {
    await service.update(directora, childId, { hasDisability: true, disabilityGroup: 'Motriz' }, request);
    const stored = repo.children.get(childId);
    expect(stored?.hasDisability).toBe(true);
    expect(encryption.decrypt(stored?.disabilityGroupEncrypted as Buffer)).toBe('Motriz');
    expect(JSON.stringify(audit.entries[0])).not.toContain('Motriz');
  });

  it('al declarar que ya no hay discapacidad borra el grupo guardado', async () => {
    await service.update(directora, childId, { hasDisability: true, disabilityGroup: 'Motriz' }, request);
    await service.update(directora, childId, { hasDisability: false }, request);
    expect(repo.children.get(childId)?.disabilityGroupEncrypted).toBeNull();
  });

  it('rechaza un grupo de discapacidad si el infante no la tiene', async () => {
    await expect(service.update(directora, childId, { disabilityGroup: 'Motriz' }, request)).rejects.toMatchObject({ code: 'DATOS_INVALIDOS' });
    expect(audit.entries).toHaveLength(0);
  });

  it('cambiar la fecha de nacimiento respeta el rango de edad de su sala', async () => {
    repo.rooms.set(1, room({ minAgeMonths: 0, maxAgeMonths: 24 }));
    await expect(service.update(directora, childId, { birthDate: '2020-01-01' }, request)).rejects.toMatchObject({ code: 'DATOS_INVALIDOS' });
  });

  it('un infante de otra estancia se trata como inexistente', async () => {
    await expect(service.update({ ...directora, activeEstanciaId: 2 }, childId, { name: 'X' }, request)).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
    await expect(service.remove({ ...directora, activeEstanciaId: 2 }, childId, request)).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
  });

  it('elimina con borrado lógico atribuido a quien lo hace y lo audita', async () => {
    await service.remove(directora, childId, request);
    expect(repo.deleted).toEqual([{ id: childId, userId: 10 }]);
    expect(audit.entries[0]).toMatchObject({ action: 'INFANTE_ELIMINADO', recordId: String(childId) });
    expect(audit.transactional).toBe(1);
  });

  it('no elimina a un infante con asistencia registrada: su historial se conserva', async () => {
    repo.withAttendance.add(childId);
    await expect(service.remove(directora, childId, request)).rejects.toMatchObject({ code: 'CONFLICTO' });
    expect(repo.deleted).toHaveLength(0);
    expect(audit.entries).toHaveLength(0);
  });
});
