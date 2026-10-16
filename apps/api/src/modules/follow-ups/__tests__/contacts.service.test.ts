import type { RegisterContactRequest } from '@sirai/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AuditService } from '../../../common/audit/audit.service.js';
import { FollowUpsService } from '../services/follow-ups.service.js';
import { FakeRepo, NOW, RecordingAudit, auth, encryption, request, ticket } from './fakes.js';

const reached: RegisterContactRequest = { result: 'CONTACTADO', guardianId: 3, cause: 'ENF_CASA', expectedReturnDate: '2026-10-20', notes: 'Fiebre desde ayer; irá a su clínica.' };

describe('FollowUpsService: contactos', () => {
  let repo: FakeRepo;
  let audit: RecordingAudit;
  let service: FollowUpsService;

  beforeEach(() => {
    repo = new FakeRepo();
    audit = new RecordingAudit();
    repo.tickets.set(1, ticket());
    repo.linked.set('5:3', encryption.encrypt('5512345678'));
    service = new FollowUpsService(repo, audit as unknown as AuditService, encryption, () => NOW);
  });

  it('contactar al tutor clasifica el ticket, activa el candado médico y audita antes y después', async () => {
    const result = await service.registerContact(auth, 1, reached, request);
    expect(result).toMatchObject({ status: 'CLASIFICADO', cause: 'ENF_CASA', requiresMedicalRelease: true, expectedReturnDate: '2026-10-20', attemptCount: 1, emergencyAlert: false });
    expect(audit.entries[0]).toMatchObject({ action: 'CONTACTO_REGISTRADO', roleCode: 'TRABAJO_SOCIAL', tableName: 'seguimientos', recordId: '1' });
    expect(audit.entries[0]?.before).toMatchObject({ status: 'ABIERTO', cause: null });
    expect(audit.entries[0]?.after).toMatchObject({ status: 'CLASIFICADO', cause: 'ENF_CASA', attemptNumber: 1, result: 'CONTACTADO' });
  });

  it('cifra las notas y el teléfono marcado, y no los pone en la bitácora', async () => {
    await service.registerContact(auth, 1, reached, request);
    const stored = repo.contacts.get(1)?.[0];
    expect(stored?.notesEncrypted?.toString('utf8')).not.toContain('Fiebre');
    expect(encryption.decrypt(stored?.notesEncrypted as Buffer)).toBe(reached.notes);
    expect(encryption.decrypt(stored?.phoneEncrypted as Buffer)).toBe('5512345678');
    expect(JSON.stringify(audit.entries)).not.toMatch(/Fiebre|5512345678/);
  });

  it('no localizar al tutor clasifica NO_LOC y programa el segundo intento a las 4 horas', async () => {
    const result = await service.registerContact(auth, 1, { result: 'SIN_RESPUESTA', guardianId: 3 }, request);
    expect(result).toMatchObject({ status: 'CLASIFICADO', cause: 'NO_LOC', attemptCount: 1, emergencyAlert: false, nextAttemptAt: '2026-10-15T20:00:00.000Z' });
  });

  it('el segundo intento sin respuesta activa la alerta a los contactos de emergencia', async () => {
    await service.registerContact(auth, 1, { result: 'SIN_RESPUESTA' }, request);
    const second = await service.registerContact(auth, 1, { result: 'SIN_RESPUESTA' }, request);
    expect(second).toMatchObject({ cause: 'NO_LOC', attemptCount: 2, emergencyAlert: true, nextAttemptAt: null });
  });

  it('un intento sin respuesta no exige tutor y no copia ningún teléfono', async () => {
    await service.registerContact(auth, 1, { result: 'SIN_RESPUESTA' }, request);
    expect(repo.contacts.get(1)?.[0]).toMatchObject({ guardianId: null, phoneEncrypted: null, notesEncrypted: null });
  });

  it('rechaza a un tutor que no está vinculado al infante', async () => {
    await expect(service.registerContact(auth, 1, { ...reached, guardianId: 99 }, request)).rejects.toMatchObject({ code: 'DATOS_INVALIDOS' });
    expect(audit.entries).toHaveLength(0);
    expect(repo.contacts.size).toBe(0);
  });

  it('un ticket de otra estancia no existe', async () => {
    await expect(service.registerContact({ ...auth, activeEstanciaId: 99 }, 1, reached, request)).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
    await expect(service.listContacts({ ...auth, activeEstanciaId: 99 }, 1, request)).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
  });

  it('no se registran intentos en un ticket cerrado', async () => {
    repo.tickets.set(1, ticket({ status: 'CERRADO' }));
    await expect(service.registerContact(auth, 1, reached, request)).rejects.toMatchObject({ code: 'CONFLICTO' });
  });

  it('exige una estancia activa', async () => {
    await expect(service.registerContact({ ...auth, activeEstanciaId: null }, 1, reached, request)).rejects.toMatchObject({ code: 'FUERA_DE_ALCANCE' });
  });

  it('el historial devuelve las notas descifradas y la lectura se audita', async () => {
    await service.registerContact(auth, 1, reached, request);
    audit.entries.length = 0;
    const contacts = await service.listContacts(auth, 1, request);
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({ attemptNumber: 1, result: 'CONTACTADO', guardianId: 3, notes: reached.notes, nextAttemptAt: null });
    expect(audit.entries[0]).toMatchObject({ action: 'NOTAS_SEGUIMIENTO_CONSULTADAS', recordId: '1' });
  });

  describe('captura sin conexión (RF-22)', () => {
    const OPERATION = '00000000-0000-4000-8000-000000000001';
    const CAPTURED = new Date('2026-10-15T12:00:00Z');

    it('registra el intento con la hora en que se capturó y calcula el segundo intento desde esa hora', async () => {
      const result = await service.registerContact(auth, 1, { result: 'SIN_RESPUESTA' }, request, { operationId: OPERATION, at: CAPTURED });
      expect(repo.contacts.get(1)?.[0]).toMatchObject({ operationId: OPERATION, occurredAt: CAPTURED });
      expect(result.nextAttemptAt).toBe('2026-10-15T16:00:00.000Z');
    });

    it('un reintento de la misma operación no duplica el intento ni lo audita otra vez', async () => {
      await service.registerContact(auth, 1, { result: 'SIN_RESPUESTA' }, request, { operationId: OPERATION, at: CAPTURED });
      audit.entries.length = 0;
      const again = await service.registerContact(auth, 1, { result: 'SIN_RESPUESTA' }, request, { operationId: OPERATION, at: CAPTURED });
      expect(repo.contacts.get(1)).toHaveLength(1);
      expect(again.attemptCount).toBe(1);
      expect(audit.entries).toHaveLength(0);
    });

    it('una hora de captura en el futuro se ajusta a la hora del servidor', async () => {
      await service.registerContact(auth, 1, { result: 'SIN_RESPUESTA' }, request, { operationId: OPERATION, at: new Date('2026-10-16T00:00:00Z') });
      expect(repo.contacts.get(1)?.[0]?.occurredAt).toEqual(NOW);
    });

    it('sin metadatos de operación se comporta como antes', async () => {
      await service.registerContact(auth, 1, { result: 'SIN_RESPUESTA' }, request);
      expect(repo.contacts.get(1)?.[0]).toMatchObject({ operationId: null, occurredAt: NOW });
    });
  });
});
