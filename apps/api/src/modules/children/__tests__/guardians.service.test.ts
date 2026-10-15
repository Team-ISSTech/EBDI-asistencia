import { beforeEach, describe, expect, it } from 'vitest';
import type { AuthContext } from '../../../common/auth/auth-context';
import { EncryptionService } from '../../../common/crypto/encryption.service';
import { RecordingAudit, request, testEnv } from '../../identity/__tests__/in-memory';
import { GuardiansService } from '../services/guardians.service';
import { InMemoryChildren, InMemoryGuardians, room } from './in-memory';

const directora: AuthContext = {
  sessionId: 1,
  userId: 10,
  principal: { userId: 10, assignments: [{ role: 'DIRECTORA', estanciaId: 1 }] },
  activeEstanciaId: 1,
};

const guardianInput = { name: 'Tutor', paternalSurname: 'Prueba', maternalSurname: null, idType: null, idFolio: null, phone: '5512345678', email: null };
const link = { guardianId: 1, relationship: 'Madre', isPrimary: true, canPickUp: true, isEmergencyContact: true, validFrom: '2026-10-14', validUntil: null };

describe('GuardiansService', () => {
  let children: InMemoryChildren;
  let guardians: InMemoryGuardians;
  let audit: RecordingAudit;
  let encryption: EncryptionService;
  let service: GuardiansService;
  let childId: number;

  beforeEach(async () => {
    children = new InMemoryChildren();
    children.rooms.set(1, room());
    guardians = new InMemoryGuardians(children);
    audit = new RecordingAudit();
    encryption = new EncryptionService(testEnv);
    service = new GuardiansService(children, guardians, encryption, audit.asService());
    childId = await children.registerChild(
      { enrollmentNumber: 'M-1', curp: null, name: 'Infante', paternalSurname: 'Prueba', maternalSurname: null, birthDate: '2025-06-01', gender: null, hasDisability: false, disabilityGroupEncrypted: null },
      { estanciaId: 1, roomId: 1, schoolYearId: 1, startDate: '2026-10-14' },
      10,
      new Date(),
    );
  });

  it('crea al tutor con el teléfono cifrado y un hash de búsqueda, y lo audita', async () => {
    const created = await service.create(directora, guardianInput, request);
    expect(created).toMatchObject({ name: 'Tutor', hasPhone: true });
    expect(created).not.toHaveProperty('phone');
    const stored = guardians.rows.get(created.id);
    expect(stored?.phoneEncrypted?.toString('utf8')).not.toContain('5512345678');
    expect(encryption.decrypt(stored?.phoneEncrypted as Buffer)).toBe('5512345678');
    expect(stored?.phoneHash?.equals(encryption.blindHash('5512345678'))).toBe(true);
    expect(audit.entries[0]).toMatchObject({ action: 'TUTOR_REGISTRADO', roleCode: 'DIRECTORA' });
    expect(JSON.stringify(audit.entries[0]?.after)).not.toContain('5512345678');
    expect(audit.transactional).toBe(1);
  });

  it('vincula al tutor con el infante y lo audita', async () => {
    const tutor = await service.create(directora, guardianInput, request);
    audit.entries.length = 0;
    const linked = await service.link(directora, childId, { ...link, guardianId: tutor.id }, request);
    expect(linked).toMatchObject({ relationship: 'Madre', isPrimary: true, isEmergencyContact: true });
    expect(audit.entries[0]).toMatchObject({ action: 'TUTOR_VINCULADO', recordId: String(childId) });
  });

  it('no deja vincular a un infante de otra estancia', async () => {
    const tutor = await service.create(directora, guardianInput, request);
    await expect(service.link({ ...directora, activeEstanciaId: 2 }, childId, { ...link, guardianId: tutor.id }, request)).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
  });

  it('rechaza un tutor inexistente', async () => {
    await expect(service.link(directora, childId, { ...link, guardianId: 999 }, request)).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
  });

  it('rechaza vincular dos veces al mismo tutor', async () => {
    const tutor = await service.create(directora, guardianInput, request);
    await service.link(directora, childId, { ...link, guardianId: tutor.id }, request);
    await expect(service.link(directora, childId, { ...link, guardianId: tutor.id, isPrimary: false }, request)).rejects.toMatchObject({ code: 'CONFLICTO' });
  });

  it('solo permite un tutor principal por infante', async () => {
    const first = await service.create(directora, guardianInput, request);
    const second = await service.create(directora, { ...guardianInput, name: 'Otro', phone: '5598765432' }, request);
    await service.link(directora, childId, { ...link, guardianId: first.id }, request);
    audit.entries.length = 0;
    await expect(service.link(directora, childId, { ...link, guardianId: second.id }, request)).rejects.toMatchObject({ code: 'CONFLICTO' });
    expect(audit.entries).toHaveLength(0);
  });

  it('lista los tutores del infante sin teléfono y lo audita como lectura', async () => {
    const tutor = await service.create(directora, guardianInput, request);
    await service.link(directora, childId, { ...link, guardianId: tutor.id }, request);
    audit.entries.length = 0;
    const list = await service.listForChild(directora, childId, request);
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty('phone');
    expect(audit.entries[0]).toMatchObject({ action: 'TUTORES_CONSULTADOS', recordId: String(childId) });
  });

  it('listar tutores de un infante ajeno se trata como inexistente', async () => {
    await expect(service.listForChild({ ...directora, activeEstanciaId: 2 }, childId, request)).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
    expect(audit.entries).toHaveLength(0);
  });

  it('revela el teléfono descifrado solo de un tutor de la estancia y audita el acceso', async () => {
    const tutor = await service.create(directora, guardianInput, request);
    await service.link(directora, childId, { ...link, guardianId: tutor.id }, request);
    audit.entries.length = 0;
    expect(await service.revealPhone(directora, tutor.id, request)).toEqual({ phone: '5512345678' });
    expect(audit.entries[0]).toMatchObject({ action: 'TELEFONO_CONSULTADO', recordId: String(tutor.id) });
    expect(JSON.stringify(audit.entries[0])).not.toContain('5512345678');
  });

  it('no revela el teléfono de un tutor sin vínculo en la estancia', async () => {
    const tutor = await service.create(directora, guardianInput, request);
    await expect(service.revealPhone(directora, tutor.id, request)).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
    expect(audit.entries.filter((e) => e.action === 'TELEFONO_CONSULTADO')).toHaveLength(0);
  });

  it('exige una estancia activa', async () => {
    await expect(service.create({ ...directora, activeEstanciaId: null }, guardianInput, request)).rejects.toMatchObject({ code: 'FUERA_DE_ALCANCE' });
  });
});
