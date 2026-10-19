import { beforeEach, describe, expect, it } from 'vitest';
import type { AuditService } from '../../../common/audit/audit.service.js';
import { EmergencyNoticesService } from '../services/emergency-notices.service.js';
import { FakeChannel, FakeNotices, NOW, RecordingAudit, encryption, notice } from './fakes.js';

describe('EmergencyNoticesService.dispatchDue (RF-27)', () => {
  let repo: FakeNotices;
  let channel: FakeChannel;
  let audit: RecordingAudit;
  let service: EmergencyNoticesService;

  beforeEach(() => {
    repo = new FakeNotices();
    channel = new FakeChannel();
    audit = new RecordingAudit();
    service = new EmergencyNoticesService(repo, channel, audit as unknown as AuditService, encryption);
  });

  it('envía al teléfono en formato internacional y marca el aviso como enviado', async () => {
    repo.due = [notice()];
    expect(await service.dispatchDue(NOW)).toBe(1);
    expect(channel.sent).toEqual(['525512345678']);
    expect(repo.settled.get(1)).toEqual({ status: 'ENVIADO', attempts: 1, retryAt: null, externalMessageId: 'wamid.1', errorCode: null });
  });

  it('sin cuenta configurada no toca la cola: los avisos esperan a que haya canal', async () => {
    channel.enabled = false;
    repo.due = [notice()];
    expect(await service.dispatchDue(NOW)).toBe(0);
    expect(repo.claims).toEqual([]);
    expect(channel.sent).toEqual([]);
  });

  it('un fallo programa el reintento a los 5 minutos y guarda solo el código del error', async () => {
    channel.next = { ok: false, code: 'WHATSAPP_131026' };
    repo.due = [notice()];
    await service.dispatchDue(NOW);
    expect(repo.settled.get(1)).toEqual({ status: 'PENDIENTE', attempts: 1, retryAt: new Date('2026-10-15T16:05:00Z'), externalMessageId: null, errorCode: 'WHATSAPP_131026' });
  });

  it('al tercer fallo el aviso queda fallido y ya no se reintenta', async () => {
    channel.next = { ok: false, code: 'SIN_RESPUESTA' };
    repo.due = [notice({ attempts: 2 })];
    await service.dispatchDue(NOW);
    expect(repo.settled.get(1)).toMatchObject({ status: 'FALLIDO', attempts: 3, retryAt: null });
  });

  it('un contacto sin teléfono se marca SIN_TELEFONO sin intentar enviar', async () => {
    repo.due = [notice({ phoneEncrypted: null })];
    await service.dispatchDue(NOW);
    expect(channel.sent).toEqual([]);
    expect(repo.settled.get(1)).toMatchObject({ status: 'SIN_TELEFONO', attempts: 0, retryAt: null, errorCode: 'SIN_TELEFONO' });
  });

  it('un teléfono que no es de 10 dígitos no se envía', async () => {
    repo.due = [notice({ phoneEncrypted: encryption.encrypt('12345') })];
    await service.dispatchDue(NOW);
    expect(channel.sent).toEqual([]);
    expect(repo.settled.get(1)).toMatchObject({ status: 'SIN_TELEFONO', errorCode: 'TELEFONO_INVALIDO' });
  });

  it('un aviso que no se puede enviar no detiene a los demás', async () => {
    repo.due = [notice({ id: 1, phoneEncrypted: null }), notice({ id: 2, guardianId: 12 })];
    expect(await service.dispatchDue(NOW)).toBe(2);
    expect(repo.settled.get(2)).toMatchObject({ status: 'ENVIADO' });
  });

  it('audita cada resultado como el sistema, sin teléfono ni nombres', async () => {
    channel.next = { ok: false, code: 'SIN_RESPUESTA' };
    repo.due = [notice({ id: 1 }), notice({ id: 2, phoneEncrypted: null })];
    await service.dispatchDue(NOW);
    channel.next = { ok: true, messageId: 'wamid.2' };
    repo.due = [notice({ id: 3 })];
    await service.dispatchDue(NOW);
    expect(audit.entries.map((entry) => entry.action)).toEqual(['AVISO_EMERGENCIA_FALLIDO', 'AVISO_EMERGENCIA_FALLIDO', 'AVISO_EMERGENCIA_ENVIADO']);
    expect(audit.entries[0]).toMatchObject({ userId: null, roleCode: 'SISTEMA', tableName: 'avisos_emergencia', recordId: '1', after: { followUpId: 4, guardianId: 11, status: 'PENDIENTE', attempts: 1, errorCode: 'SIN_RESPUESTA' } });
    expect(JSON.stringify(audit.entries)).not.toMatch(/5512345678|525512345678/);
  });

  it('reserva los avisos 5 minutos y toma de a 20 por corrida', async () => {
    repo.due = [notice()];
    await service.dispatchDue(NOW);
    expect(repo.claims).toEqual([{ limit: 20, leaseMs: 300_000 }]);
  });
});
