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
const link = { relationship: 'Madre', isPrimary: true, canPickUp: true, isEmergencyContact: true, validFrom: '2026-10-14', validUntil: null };

describe('GuardiansService: editar y desvincular (RF-34)', () => {
  let children: InMemoryChildren;
  let guardians: InMemoryGuardians;
  let audit: RecordingAudit;
  let encryption: EncryptionService;
  let service: GuardiansService;
  let childId: number;
  let guardianId: number;

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
    guardianId = (await service.create(directora, guardianInput, request)).id;
    await service.link(directora, childId, { ...link, guardianId }, request);
    audit.entries.length = 0;
    audit.transactional = 0;
  });

  it('edita al tutor y audita solo los nombres de los campos', async () => {
    const updated = await service.update(directora, guardianId, { name: 'Marta', email: 'marta@example.com' }, request);
    expect(updated).toMatchObject({ name: 'Marta', paternalSurname: 'Prueba' });
    expect(audit.entries[0]).toMatchObject({ action: 'TUTOR_ACTUALIZADO', recordId: String(guardianId), after: { fields: ['name', 'email'] } });
    expect(JSON.stringify(audit.entries[0])).not.toContain('marta@example.com');
    expect(audit.transactional).toBe(1);
  });

  it('un teléfono nuevo se vuelve a cifrar y se vuelve a calcular su hash, sin pasar por la bitácora', async () => {
    await service.update(directora, guardianId, { phone: '5598765432' }, request);
    const stored = guardians.rows.get(guardianId);
    expect(encryption.decrypt(stored?.phoneEncrypted as Buffer)).toBe('5598765432');
    expect(stored?.phoneHash?.equals(encryption.blindHash('5598765432'))).toBe(true);
    expect(JSON.stringify(audit.entries[0])).not.toContain('5598765432');
  });

  it('no edita a un tutor que no está vinculado a la estancia', async () => {
    await expect(service.update({ ...directora, activeEstanciaId: 2 }, guardianId, { name: 'X' }, request)).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
  });

  it('cambia permisos del vínculo y los audita', async () => {
    const changed = await service.updateLink(directora, childId, guardianId, { canPickUp: false, relationship: 'Abuela' }, request);
    expect(changed).toMatchObject({ canPickUp: false, relationship: 'Abuela' });
    expect(audit.entries[0]).toMatchObject({ action: 'TUTOR_VINC_ACTUALIZADO', recordId: String(childId) });
  });

  it('no deja dos tutores principales ni una vigencia anterior a su inicio', async () => {
    const other = (await service.create(directora, { ...guardianInput, name: 'Otro', phone: '5598765432' }, request)).id;
    await service.link(directora, childId, { ...link, guardianId: other, isPrimary: false }, request);
    await expect(service.updateLink(directora, childId, other, { isPrimary: true }, request)).rejects.toMatchObject({ code: 'CONFLICTO' });
    await expect(service.updateLink(directora, childId, other, { validUntil: '2020-01-01' }, request)).rejects.toMatchObject({ code: 'DATOS_INVALIDOS' });
  });

  it('desvincular cierra la vigencia ayer (hoy ya no aparece) y libera el lugar de tutor principal, sin borrar nada', async () => {
    await service.unlink(directora, childId, guardianId, request);
    expect(await guardians.listForChild(childId)).toHaveLength(0);
    expect(guardians.links[0]?.link).toMatchObject({ isPrimary: false });
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    expect(guardians.links[0]?.link.validUntil).toBe(yesterday);
    expect(audit.entries[0]).toMatchObject({ action: 'TUTOR_DESVINCULADO', recordId: String(childId) });
    expect(guardians.rows.has(guardianId)).toBe(true);
  });

  it('un vínculo creado hoy no tiene historia que conservar: desvincular lo da de baja con borrado lógico', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const fresh = (await service.create(directora, { ...guardianInput, name: 'Nuevo', phone: '5598765432' }, request)).id;
    await service.link(directora, childId, { ...link, guardianId: fresh, isPrimary: false, validFrom: today }, request);
    await service.unlink(directora, childId, fresh, request);
    expect(guardians.links.some((entry) => entry.link.guardianId === fresh)).toBe(false);
    expect(guardians.deletedLinks).toEqual([{ childId, guardianId: fresh, userId: 10 }]);
  });

  it('desvincular a quien ya no está vinculado responde NO_ENCONTRADO', async () => {
    await service.unlink(directora, childId, guardianId, request);
    await expect(service.unlink(directora, childId, guardianId, request)).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
  });
});
