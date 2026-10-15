import { beforeEach, describe, expect, it } from 'vitest';
import type { AuthContext } from '../../../common/auth/auth-context';
import { RecordingAudit, request } from '../../identity/__tests__/in-memory';
import { ConsentsService } from '../services/consents.service';
import { InMemoryChildren, InMemoryConsents, InMemoryGuardians, room } from './in-memory';

const directora: AuthContext = {
  sessionId: 1,
  userId: 10,
  principal: { userId: 10, assignments: [{ role: 'DIRECTORA', estanciaId: 1 }] },
  activeEstanciaId: 1,
};

const phoneConsent = { guardianId: 1, type: 'CONTACTO_TELEFONICO' as const, noticeVersion: 'AP-2026-1', accepted: true };

describe('ConsentsService', () => {
  let children: InMemoryChildren;
  let guardians: InMemoryGuardians;
  let consents: InMemoryConsents;
  let audit: RecordingAudit;
  let service: ConsentsService;
  let childId: number;
  let now: Date;

  beforeEach(async () => {
    now = new Date('2026-10-14T12:00:00Z');
    children = new InMemoryChildren();
    children.rooms.set(1, room());
    guardians = new InMemoryGuardians(children);
    consents = new InMemoryConsents();
    audit = new RecordingAudit();
    service = new ConsentsService(children, guardians, consents, audit.asService(), () => now);
    childId = await children.registerChild(
      { enrollmentNumber: 'M-1', curp: null, name: 'Infante', paternalSurname: 'Prueba', maternalSurname: null, birthDate: '2025-06-01', gender: null, hasDisability: false, disabilityGroupEncrypted: null },
      { estanciaId: 1, roomId: 1, schoolYearId: 1, startDate: '2026-10-14' },
      10,
      now,
    );
    const guardianId = await guardians.create({ name: 'Tutor', paternalSurname: 'Prueba', maternalSurname: null, idType: null, idFolio: null, phoneEncrypted: Buffer.from('x'), phoneHash: Buffer.alloc(32), email: null }, now);
    await guardians.link(childId, { guardianId, relationship: 'Madre', isPrimary: true, canPickUp: true, isEmergencyContact: true, validFrom: '2026-10-14', validUntil: null }, now);
  });

  it('registra la aceptación con versión del aviso y la audita en la misma transacción', async () => {
    const created = await service.register(directora, childId, phoneConsent, request);
    expect(created).toMatchObject({ childId, guardianId: 1, type: 'CONTACTO_TELEFONICO', accepted: true, revokedAt: null, acceptedAt: now.toISOString() });
    expect(audit.entries[0]).toMatchObject({ action: 'CONSENTIMIENTO_REGISTRADO', recordId: String(created.id), roleCode: 'DIRECTORA' });
    expect(audit.transactional).toBe(1);
  });

  it('solo registra consentimientos de tutores vinculados al infante', async () => {
    await expect(service.register(directora, childId, { ...phoneConsent, guardianId: 77 }, request)).rejects.toMatchObject({ code: 'DATOS_INVALIDOS' });
    expect(audit.entries).toHaveLength(0);
  });

  it('no permite registrar otra aceptación mientras la anterior sigue vigente', async () => {
    await service.register(directora, childId, phoneConsent, request);
    await expect(service.register(directora, childId, phoneConsent, request)).rejects.toMatchObject({ code: 'CONFLICTO' });
  });

  it('permite un tipo distinto y registrar un rechazo explícito', async () => {
    await service.register(directora, childId, phoneConsent, request);
    await expect(service.register(directora, childId, { ...phoneConsent, type: 'TRATAMIENTO_DATOS_SENSIBLES', accepted: false }, request)).resolves.toMatchObject({ accepted: false });
  });

  it('revoca marcando revocado_at, sin borrar, y audita antes y después', async () => {
    const created = await service.register(directora, childId, phoneConsent, request);
    audit.entries.length = 0;
    now = new Date('2026-10-20T08:00:00Z');
    const revoked = await service.revoke(directora, created.id, request);
    expect(revoked.revokedAt).toBe('2026-10-20T08:00:00.000Z');
    expect(consents.rows.has(created.id)).toBe(true);
    expect(audit.entries[0]).toMatchObject({ action: 'CONSENTIMIENTO_REVOCADO', recordId: String(created.id) });
    expect(audit.entries[0]?.before).toMatchObject({ revokedAt: null });
    expect(audit.entries[0]?.after).toMatchObject({ revokedAt: '2026-10-20T08:00:00.000Z' });
  });

  it('no revoca dos veces ni un rechazo', async () => {
    const accepted = await service.register(directora, childId, phoneConsent, request);
    await service.revoke(directora, accepted.id, request);
    await expect(service.revoke(directora, accepted.id, request)).rejects.toMatchObject({ code: 'CONFLICTO' });
    const refused = await service.register(directora, childId, { ...phoneConsent, type: 'TRATAMIENTO_DATOS_SENSIBLES', accepted: false }, request);
    await expect(service.revoke(directora, refused.id, request)).rejects.toMatchObject({ code: 'CONFLICTO' });
  });

  it('permite volver a aceptar tras una revocación', async () => {
    const first = await service.register(directora, childId, phoneConsent, request);
    await service.revoke(directora, first.id, request);
    now = new Date('2026-10-25T08:00:00Z');
    await expect(service.register(directora, childId, phoneConsent, request)).resolves.toMatchObject({ revokedAt: null });
  });

  it('un consentimiento de otra estancia se trata como inexistente', async () => {
    const created = await service.register(directora, childId, phoneConsent, request);
    await expect(service.revoke({ ...directora, activeEstanciaId: 2 }, created.id, request)).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
    await expect(service.list({ ...directora, activeEstanciaId: 2 }, childId, request)).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
  });

  it('lista el historial y lo audita como lectura', async () => {
    await service.register(directora, childId, phoneConsent, request);
    audit.entries.length = 0;
    expect(await service.list(directora, childId, request)).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({ action: 'CONSENTIMIENTOS_CONSULTADOS', recordId: String(childId) });
  });

  it('exige una estancia activa', async () => {
    await expect(service.register({ ...directora, activeEstanciaId: null }, childId, phoneConsent, request)).rejects.toMatchObject({ code: 'FUERA_DE_ALCANCE' });
  });
});
