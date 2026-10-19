import { beforeEach, describe, expect, it } from 'vitest';
import type { AuditService } from '../../../common/audit/audit.service.js';
import { FollowUpsService } from '../services/follow-ups.service.js';
import { FakeRepo, NOW, RecordingAudit, auth, encryption, request, ticket } from './fakes.js';

/** RF-27: el segundo intento sin respuesta deja un aviso por cada contacto de emergencia. */
describe('FollowUpsService: avisos a contactos de emergencia', () => {
  let repo: FakeRepo;
  let audit: RecordingAudit;
  let service: FollowUpsService;
  const noticesOf = (attempt: number): readonly number[] | undefined => repo.contacts.get(1)?.[attempt - 1]?.emergencyGuardianIds;

  beforeEach(() => {
    repo = new FakeRepo();
    audit = new RecordingAudit();
    repo.tickets.set(1, ticket());
    repo.linked.set('5:3', encryption.encrypt('5512345678'));
    repo.emergencyGuardians = [11, 12];
    service = new FollowUpsService(repo, audit as unknown as AuditService, encryption, () => NOW);
  });

  it('el primer intento sin respuesta no avisa a nadie', async () => {
    await service.registerContact(auth, 1, { result: 'SIN_RESPUESTA' }, request);
    expect(noticesOf(1)).toEqual([]);
  });

  it('el segundo intento sin respuesta avisa a cada contacto de emergencia', async () => {
    await service.registerContact(auth, 1, { result: 'SIN_RESPUESTA' }, request);
    await service.registerContact(auth, 1, { result: 'SIN_RESPUESTA' }, request);
    expect(noticesOf(2)).toEqual([11, 12]);
  });

  it('queda en la bitácora cuántos avisos se dejaron, sin nombres ni teléfonos', async () => {
    await service.registerContact(auth, 1, { result: 'SIN_RESPUESTA' }, request);
    await service.registerContact(auth, 1, { result: 'SIN_RESPUESTA' }, request);
    expect(audit.entries[1]?.after).toMatchObject({ emergencyNotices: 2 });
  });

  it('hablar con el tutor no avisa a los contactos de emergencia', async () => {
    repo.tickets.set(1, ticket({ failedAttempts: 1, cause: 'NO_LOC', status: 'CLASIFICADO', attemptCount: 1 }));
    await service.registerContact(auth, 1, { result: 'CONTACTADO', guardianId: 3, cause: 'ENF_CASA', expectedReturnDate: '2026-10-20' }, request);
    expect(noticesOf(1)).toEqual([]);
  });

  it('sin contactos de emergencia registrados el intento se guarda igual', async () => {
    repo.emergencyGuardians = [];
    await service.registerContact(auth, 1, { result: 'SIN_RESPUESTA' }, request);
    const second = await service.registerContact(auth, 1, { result: 'SIN_RESPUESTA' }, request);
    expect(second.emergencyAlert).toBe(true);
    expect(noticesOf(2)).toEqual([]);
  });
});
