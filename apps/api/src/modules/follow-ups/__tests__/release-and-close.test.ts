import { beforeEach, describe, expect, it } from 'vitest';
import type { AuditService } from '../../../common/audit/audit.service.js';
import { FollowUpsService } from '../services/follow-ups.service.js';
import { FakeRepo, NOW, RecordingAudit, auth, containing, doctorAuth, encryption, request, ticket } from './fakes.js';

const medicalCase = () => ticket({ status: 'CLASIFICADO', cause: 'ENF_CASA', requiresMedicalRelease: true, attemptCount: 1, expectedReturnDate: '2026-10-25' });

describe('FollowUpsService: alta médica y cierre', () => {
  let repo: FakeRepo;
  let audit: RecordingAudit;
  let service: FollowUpsService;

  beforeEach(() => {
    repo = new FakeRepo();
    audit = new RecordingAudit();
    repo.tickets.set(1, medicalCase());
    service = new FollowUpsService(repo, audit as unknown as AuditService, encryption, () => NOW);
  });

  describe('registerRelease', () => {
    it('el médico registra el alta, se libera el candado y se audita el antes y el después', async () => {
      const result = await service.registerRelease(doctorAuth, 1, { dischargeDate: '2026-10-15', folio: 'ALTA-1', observations: 'Sin fiebre 48 h.' }, request);
      expect(result.medicalReleased).toBe(true);
      expect(audit.entries[0]).toMatchObject({ action: 'ALTA_MEDICA_REGISTRADA', roleCode: 'MEDICO', recordId: '1', before: { medicalLock: true }, after: { medicalLock: false, dischargeDate: '2026-10-15', folio: 'ALTA-1' } });
    });

    it('cifra las observaciones médicas y no las pone en la bitácora', async () => {
      await service.registerRelease(doctorAuth, 1, { dischargeDate: '2026-10-15', observations: 'Sin fiebre 48 h.' }, request);
      const stored = repo.releases.get(1);
      expect(stored?.observationsEncrypted?.toString('utf8')).not.toContain('fiebre');
      expect(encryption.decrypt(stored?.observationsEncrypted as Buffer)).toBe('Sin fiebre 48 h.');
      expect(JSON.stringify(audit.entries)).not.toContain('fiebre');
    });

    it('no se da el alta de un caso que no requiere alta, ya liberado o cerrado', async () => {
      repo.tickets.set(1, ticket({ status: 'CLASIFICADO', cause: 'PER_TUT', attemptCount: 1 }));
      await expect(service.registerRelease(doctorAuth, 1, { dischargeDate: '2026-10-15' }, request)).rejects.toMatchObject({ code: 'CONFLICTO' });
      repo.tickets.set(1, { ...medicalCase(), released: true });
      await expect(service.registerRelease(doctorAuth, 1, { dischargeDate: '2026-10-15' }, request)).rejects.toMatchObject({ code: 'CONFLICTO' });
      repo.tickets.set(1, { ...medicalCase(), status: 'CERRADO' });
      await expect(service.registerRelease(doctorAuth, 1, { dischargeDate: '2026-10-15' }, request)).rejects.toMatchObject({ code: 'CONFLICTO' });
      expect(audit.entries).toHaveLength(0);
    });

    it('rechaza una fecha de alta futura', async () => {
      await expect(service.registerRelease(doctorAuth, 1, { dischargeDate: '2026-10-16' }, request)).rejects.toMatchObject({ code: 'DATOS_INVALIDOS' });
      expect(repo.releases.size).toBe(0);
    });

    it('un ticket de otra estancia no existe', async () => {
      await expect(service.registerRelease({ ...doctorAuth, activeEstanciaId: 99 }, 1, { dischargeDate: '2026-10-15' }, request)).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
    });
  });

  describe('close', () => {
    it('cierra un caso clasificado con contacto y lo audita', async () => {
      repo.tickets.set(1, ticket({ status: 'CLASIFICADO', cause: 'PER_TUT', attemptCount: 2 }));
      const result = await service.close(auth, 1, request);
      expect(result.status).toBe('CERRADO');
      expect(repo.closedAt.get(1)).toEqual(NOW);
      expect(audit.entries[0]).toMatchObject({ action: 'SEGUIMIENTO_CERRADO', recordId: '1', before: { status: 'CLASIFICADO' }, after: { status: 'CERRADO' } });
    });

    it('exige haber llamado al tutor y haber clasificado la causa', async () => {
      repo.tickets.set(1, ticket({ attemptCount: 0 }));
      await expect(service.close(auth, 1, request)).rejects.toMatchObject({ code: 'CONFLICTO', message: containing('llamada') });
      repo.tickets.set(1, ticket({ attemptCount: 1, cause: null }));
      await expect(service.close(auth, 1, request)).rejects.toMatchObject({ code: 'CONFLICTO', message: containing('causa') });
      expect(audit.entries).toHaveLength(0);
    });

    it('un caso con candado médico no se cierra sin el alta', async () => {
      await expect(service.close(auth, 1, request)).rejects.toMatchObject({ code: 'CONFLICTO', message: containing('alta médica') });
      await service.registerRelease(doctorAuth, 1, { dischargeDate: '2026-10-15' }, request);
      await expect(service.close(auth, 1, request)).resolves.toMatchObject({ status: 'CERRADO' });
    });

    it('un caso cerrado no se vuelve a cerrar', async () => {
      repo.tickets.set(1, { ...medicalCase(), status: 'CERRADO' });
      await expect(service.close(auth, 1, request)).rejects.toMatchObject({ code: 'CONFLICTO' });
    });

    it('un ticket de otra estancia no existe y se exige estancia activa', async () => {
      await expect(service.close({ ...auth, activeEstanciaId: 99 }, 1, request)).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
      await expect(service.close({ ...auth, activeEstanciaId: null }, 1, request)).rejects.toMatchObject({ code: 'FUERA_DE_ALCANCE' });
    });
  });
});
