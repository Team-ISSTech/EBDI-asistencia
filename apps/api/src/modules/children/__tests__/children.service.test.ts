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

describe('ChildrenService', () => {
  let repo: InMemoryChildren;
  let audit: RecordingAudit;
  let encryption: EncryptionService;
  let service: ChildrenService;

  beforeEach(() => {
    repo = new InMemoryChildren();
    repo.rooms.set(1, room());
    audit = new RecordingAudit();
    encryption = new EncryptionService(testEnv);
    service = new ChildrenService(repo, encryption, audit.asService(), () => new Date('2026-10-14T12:00:00Z'));
  });

  it('da de alta al infante con su inscripción y audita en la misma transacción', async () => {
    const created = await service.enroll(directora, input, request);
    expect(created).toMatchObject({ enrollmentNumber: 'M-0001', roomId: 1, roomName: 'Lactantes A', status: 'ACTIVO' });
    expect(repo.enrollments).toEqual([{ estanciaId: 1, roomId: 1, schoolYearId: 1, startDate: '2026-10-14' }]);
    expect(audit.entries[0]).toMatchObject({ action: 'INFANTE_REGISTRADO', roleCode: 'DIRECTORA', recordId: String(created.id) });
    expect(audit.transactional).toBe(1);
  });

  it('cifra el grupo de discapacidad antes de llegar al repositorio', async () => {
    const created = await service.enroll(directora, { ...input, hasDisability: true, disabilityGroup: 'Motriz' }, request);
    const stored = repo.children.get(created.id)?.disabilityGroupEncrypted;
    expect(stored).toBeInstanceOf(Buffer);
    expect(stored?.toString('utf8')).not.toContain('Motriz');
    expect(encryption.decrypt(stored as Buffer)).toBe('Motriz');
  });

  it('no registra el grupo de discapacidad en la bitácora', async () => {
    await service.enroll(directora, { ...input, hasDisability: true, disabilityGroup: 'Motriz' }, request);
    expect(JSON.stringify(audit.entries[0]?.after)).not.toContain('Motriz');
  });

  it('rechaza una sala de otra estancia como si no existiera', async () => {
    repo.rooms.set(2, room({ id: 2, estanciaId: 99 }));
    await expect(service.enroll(directora, { ...input, roomId: 2 }, request)).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
    expect(audit.entries).toHaveLength(0);
  });

  it('rechaza una sala inactiva', async () => {
    repo.rooms.set(1, room({ status: 'INACTIVO' }));
    await expect(service.enroll(directora, input, request)).rejects.toMatchObject({ code: 'CONFLICTO' });
  });

  it('rechaza un infante fuera del rango de edad de la sala', async () => {
    repo.rooms.set(1, room({ minAgeMonths: 24, maxAgeMonths: 36 }));
    await expect(service.enroll(directora, input, request)).rejects.toMatchObject({ code: 'DATOS_INVALIDOS' });
  });

  it('exige un ciclo escolar activo', async () => {
    repo.schoolYearId = null;
    await expect(service.enroll(directora, input, request)).rejects.toMatchObject({ code: 'CONFLICTO' });
  });

  it('propaga el conflicto por matrícula duplicada sin auditar', async () => {
    await service.enroll(directora, input, request);
    audit.entries.length = 0;
    await expect(service.enroll(directora, input, request)).rejects.toMatchObject({ code: 'CONFLICTO' });
    expect(audit.entries).toHaveLength(0);
  });

  it('exige una estancia activa', async () => {
    await expect(service.enroll({ ...directora, activeEstanciaId: null }, input, request)).rejects.toMatchObject({ code: 'FUERA_DE_ALCANCE' });
  });

  it('lista solo los infantes de la estancia activa y lo audita como lectura', async () => {
    await service.enroll(directora, input, request);
    audit.entries.length = 0;
    expect(await service.list(directora, request)).toHaveLength(1);
    expect(await service.list({ ...directora, activeEstanciaId: 2 }, request)).toHaveLength(0);
    expect(audit.entries[0]).toMatchObject({ action: 'INFANTES_CONSULTADOS', userId: 10 });
  });

  it('lista las salas activas de la estancia sin auditar', async () => {
    repo.rooms.set(2, room({ id: 2, name: 'Inactiva', status: 'INACTIVO' }));
    const rooms = await service.listRooms(directora);
    expect(rooms.map((r) => r.name)).toEqual(['Lactantes A']);
    expect(audit.entries).toHaveLength(0);
  });
});
