import { createHash } from 'node:crypto';
import type { Principal } from '@sirai/auth';
import { beforeEach, describe, expect, it } from 'vitest';
import type { AuditEntry, AuditService } from '../../../common/audit/audit.service.js';
import type { AuthContext } from '../../../common/auth/auth-context.js';
import { EncryptionService } from '../../../common/crypto/encryption.service.js';
import type { RequestContext } from '../../../common/http/request-context.js';
import type { DossierRaw, IssuedDossier } from '../dossiers.types.js';
import type { DossiersRepository, IssueInput } from '../repositories/dossiers.repository.js';
import { DossierService, canonicalJson, sealMessage } from '../services/dossier.service.js';

const request: RequestContext = { ip: '127.0.0.1', userAgent: 'vitest', requestId: 'req-1' };
const principal: Principal = { userId: 7, assignments: [{ role: 'DIRECTORA', estanciaId: 3 }] };
const auth: AuthContext = { sessionId: 1, userId: 7, principal, activeEstanciaId: 3 };
const encryption = new EncryptionService({ DATA_ENCRYPTION_KEY: 'a'.repeat(64) } as never);
const ISSUED = new Date('2026-10-30T12:00:00Z');
const pdfText = (buffer: Buffer): string =>
  [...buffer.toString('latin1').matchAll(/\[([^\]]*)\] TJ/g)]
    .map((match) => [...(match[1] ?? '').matchAll(/<([0-9a-f]*)>/gi)].map((hex) => Buffer.from(hex[1] ?? '', 'hex').toString('latin1')).join(''))
    .join('\n');

const raw = (): DossierRaw => ({
  child: { id: 5, enrollmentNumber: 'M-1', curp: null, name: 'Infante', paternalSurname: 'Prueba', maternalSurname: 'Dos', birthDate: '2025-03-10', gender: null, hasDisability: true, disabilityGroupEncrypted: encryption.encrypt('Motriz'), status: 'ACTIVO' },
  estancia: { id: 3, code: 'EBDI-03', name: 'Estancia Tres' },
  enrollments: [{ estanciaName: 'Estancia Tres', roomName: 'Lactantes', schoolYear: '2026-2027', startDate: '2026-08-24', endDate: null, status: 'ACTIVA' }],
  movements: [{ type: 'ALTA', occurredAt: new Date('2026-08-24T15:00:00Z'), reason: null }],
  guardians: [{ name: 'Tutora', paternalSurname: 'Prueba', maternalSurname: null, relationship: 'Madre', isPrimary: true, canPickUp: true, isEmergencyContact: true, validFrom: '2026-08-24', validUntil: null, phoneEncrypted: encryption.encrypt('5512345678') }],
  consents: [],
  attendance: [{ status: 'PRESENTE', total: 3 }],
  followUps: [
    {
      absenceDate: '2026-10-15', absenceStatus: 'FALTA_INJUSTIFICADA', status: 'CERRADO', cause: 'ENF_CASA', expectedReturnDate: '2026-10-30', requiresMedicalRelease: true, openedAt: new Date('2026-10-15T15:00:00Z'), closedAt: new Date('2026-10-29T15:00:00Z'),
      contacts: [{ attemptNumber: 1, occurredAt: new Date('2026-10-15T16:00:00Z'), result: 'CONTACTADO', guardianName: 'Tutora Prueba', notesEncrypted: encryption.encrypt('Fiebre desde ayer.') }],
      release: { dischargeDate: '2026-10-28', folio: 'ALTA-1', observationsEncrypted: encryption.encrypt('Sin fiebre 48 h.') },
    },
  ],
});

class FakeRepo implements DossiersRepository {
  data: DossierRaw | null = raw();
  issued = new Map<number, IssuedDossier>();
  nextId = 42;
  loadedWith: [number, number] | null = null;

  load(childId: number, estanciaId: number): Promise<DossierRaw | null> {
    this.loadedWith = [childId, estanciaId];
    return Promise.resolve(estanciaId === 3 ? this.data : null);
  }
  async issue(input: IssueInput, sealOf: (id: number) => Buffer, hook: (executor: never, id: number) => Promise<void>): Promise<number> {
    const id = this.nextId++;
    this.issued.set(id, { id, childId: input.childId, estanciaName: 'Estancia Tres', issuedAt: input.issuedAt, contentSha256: input.contentSha256, seal: sealOf(id) });
    await hook({} as never, id);
    return id;
  }
  findIssued(id: number): Promise<IssuedDossier | null> {
    return Promise.resolve(this.issued.get(id) ?? null);
  }
}

class RecordingAudit {
  entries: AuditEntry[] = [];
  record(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);
    return Promise.resolve();
  }
}

describe('canonicalJson', () => {
  it('es estable: el orden de las llaves no cambia el resultado', () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: [3, { z: 1, y: 2 }] } })).toBe(canonicalJson({ a: { c: [3, { y: 2, z: 1 }], d: 2 }, b: 1 }));
    expect(canonicalJson({ a: 1 })).not.toBe(canonicalJson({ a: 2 }));
  });
});

describe('DossierService (RF-19)', () => {
  let repo: FakeRepo;
  let audit: RecordingAudit;
  let service: DossierService;

  beforeEach(() => {
    repo = new FakeRepo();
    audit = new RecordingAudit();
    service = new DossierService(repo, encryption, audit as unknown as AuditService, () => ISSUED, { compress: false });
  });

  it('emite el PDF con folio consecutivo del año y lo nombra con él', async () => {
    const file = await service.export(auth, 5, request);
    expect(file.filename).toBe('expediente-EXP-2026-000042.pdf');
    expect(file.buffer.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('descifra lo sensible al imprimirlo: discapacidad, teléfono, notas y observaciones del alta', async () => {
    const text = pdfText((await service.export(auth, 5, request)).buffer);
    for (const expected of ['Motriz', '5512345678', 'Fiebre desde ayer.', 'Sin fiebre 48 h.', 'Infante Prueba Dos']) expect(text).toContain(expected);
  });

  it('el sello del PDF es el HMAC de folio, infante, fecha y huella del contenido, y queda guardado', async () => {
    const file = await service.export(auth, 5, request);
    const stored = repo.issued.get(42);
    const sealHex = stored?.seal?.toString('hex') ?? '';
    expect(pdfText(file.buffer)).toContain(sealHex);
    const expected = encryption.seal(sealMessage('EXP-2026-000042', 5, ISSUED, (stored?.contentSha256 as Buffer).toString('hex')));
    expect(stored?.seal?.equals(expected)).toBe(true);
  });

  it('la huella cubre el contenido: dos emisiones del mismo expediente dan la misma huella; un cambio la altera', async () => {
    await service.export(auth, 5, request);
    await service.export(auth, 5, request);
    expect(repo.issued.get(42)?.contentSha256.equals(repo.issued.get(43)?.contentSha256 as Buffer)).toBe(true);
    repo.data = { ...raw(), child: { ...raw().child, name: 'Otro' } };
    await service.export(auth, 5, request);
    expect(repo.issued.get(44)?.contentSha256.equals(repo.issued.get(42)?.contentSha256 as Buffer)).toBe(false);
    expect(repo.issued.get(42)?.contentSha256.toString('hex')).toMatch(/^[0-9a-f]{64}$/);
    expect(createHash('sha256').update('x').digest()).toHaveLength(32);
  });

  it('audita la exportación con folio e infante, sin el contenido', async () => {
    await service.export(auth, 5, request);
    expect(audit.entries).toHaveLength(1);
    expect(audit.entries[0]).toMatchObject({ action: 'EXPEDIENTE_EXPORTADO', roleCode: 'DIRECTORA', tableName: 'expedientes_emitidos', recordId: '42', after: { folio: 'EXP-2026-000042', childId: 5 } });
    expect(JSON.stringify(audit.entries)).not.toMatch(/Motriz|5512345678|Fiebre/);
  });

  it('un infante que no es de la estancia no existe, y no se emite ni audita nada', async () => {
    await expect(service.export({ ...auth, activeEstanciaId: 99 }, 5, request)).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
    repo.data = null;
    await expect(service.export(auth, 5, request)).rejects.toMatchObject({ code: 'NO_ENCONTRADO' });
    expect(repo.issued.size).toBe(0);
    expect(audit.entries).toHaveLength(0);
  });

  it('exige una estancia activa', async () => {
    await expect(service.export({ ...auth, activeEstanciaId: null }, 5, request)).rejects.toMatchObject({ code: 'FUERA_DE_ALCANCE' });
  });

  describe('verify', () => {
    const issue = async () => {
      await service.export(auth, 5, request);
      return repo.issued.get(42) as IssuedDossier;
    };

    it('confirma un expediente auténtico y revela solo cuándo y dónde se emitió', async () => {
      const stored = await issue();
      const result = await service.verify(auth, { folio: 'EXP-2026-000042', seal: stored.seal?.toString('hex') ?? '' }, request);
      expect(result).toEqual({ valid: true, issuedAt: '2026-10-30T12:00:00.000Z', originEstancia: 'Estancia Tres' });
    });

    it('rechaza un sello falso, un folio que no existe y un folio distinto del sello, sin distinguir cuál falló', async () => {
      const stored = await issue();
      const seal = stored.seal?.toString('hex') ?? '';
      expect(await service.verify(auth, { folio: 'EXP-2026-000042', seal: 'f'.repeat(64) }, request)).toEqual({ valid: false });
      expect(await service.verify(auth, { folio: 'EXP-2026-000999', seal }, request)).toEqual({ valid: false });
      expect(await service.verify(auth, { folio: 'EXP-2025-000042', seal }, request)).toEqual({ valid: false });
    });

    it('un registro manipulado en la base (sello almacenado distinto del que la llave produce) no es válido', async () => {
      const stored = await issue();
      repo.issued.set(42, { ...stored, seal: Buffer.alloc(32, 7) });
      expect(await service.verify(auth, { folio: 'EXP-2026-000042', seal: '07'.repeat(32) }, request)).toEqual({ valid: false });
    });

    it('un expediente sin sellar nunca es válido', async () => {
      const stored = await issue();
      repo.issued.set(42, { ...stored, seal: null });
      expect(await service.verify(auth, { folio: 'EXP-2026-000042', seal: 'a'.repeat(64) }, request)).toEqual({ valid: false });
    });

    it('audita cada verificación con su resultado', async () => {
      await issue();
      audit.entries.length = 0;
      await service.verify(auth, { folio: 'EXP-2026-000042', seal: 'f'.repeat(64) }, request);
      expect(audit.entries[0]).toMatchObject({ action: 'EXPEDIENTE_VERIFICADO', after: { folio: 'EXP-2026-000042', valid: false } });
    });
  });
});
