import { describe, expect, it } from 'vitest';
import { buildDossierPdf } from '../services/dossier-pdf.js';
import type { DossierDocument } from '../dossiers.types.js';

const pdfText = (buffer: Buffer): string =>
  [...buffer.toString('latin1').matchAll(/\[([^\]]*)\] TJ/g)]
    .map((match) => [...(match[1] ?? '').matchAll(/<([0-9a-f]*)>/gi)].map((hex) => Buffer.from(hex[1] ?? '', 'hex').toString('latin1')).join(''))
    .join('\n');

const document: DossierDocument = {
  child: { enrollmentNumber: 'M-0001', curp: 'AAAA240310MDFXXX01', fullName: 'Infante Uno Prueba', birthDate: '2025-03-10', gender: 'F', hasDisability: true, disabilityGroup: 'Motriz', status: 'ACTIVO' },
  estancia: { code: 'EBDI-01', name: 'Estancia Uno' },
  enrollments: [{ estanciaName: 'Estancia Uno', roomName: 'Lactantes', schoolYear: '2026-2027', startDate: '2026-08-24', endDate: null, status: 'ACTIVA' }],
  movements: [{ type: 'ALTA', occurredAt: '2026-08-24T15:00:00.000Z', reason: null }],
  guardians: [{ fullName: 'Tutora Prueba', relationship: 'Madre', isPrimary: true, canPickUp: true, isEmergencyContact: true, validFrom: '2026-08-24', validUntil: null, phone: '5512345678' }],
  consents: [{ type: 'CONTACTO_TELEFONICO', noticeVersion: 'AP-2026-1', accepted: true, acceptedAt: '2026-08-24T15:00:00.000Z', revokedAt: null }],
  attendance: [{ status: 'PRESENTE', total: 40 }, { status: 'FALTA_INJUSTIFICADA', total: 2 }],
  followUps: [
    {
      absenceDate: '2026-10-15', absenceStatus: 'FALTA_INJUSTIFICADA', status: 'CERRADO', cause: 'ENF_CASA', expectedReturnDate: '2026-10-30', requiresMedicalRelease: true, openedAt: '2026-10-15T15:00:00.000Z', closedAt: '2026-10-29T15:00:00.000Z',
      contacts: [{ attemptNumber: 1, occurredAt: '2026-10-15T16:00:00.000Z', result: 'CONTACTADO', guardianName: 'Tutora Prueba', notes: 'Fiebre desde ayer; irá a su clínica.' }],
      release: { dischargeDate: '2026-10-28', folio: 'ALTA-0042', observations: 'Sin fiebre desde hace 48 h.' },
    },
  ],
};

const SEAL = 'ab'.repeat(32);
const meta = { folio: 'EXP-2026-000042', seal: SEAL, contentSha256: 'cd'.repeat(32), issuedAt: new Date('2026-10-30T12:00:00Z') };

describe('buildDossierPdf (RF-19)', () => {
  it('genera un PDF válido', async () => {
    const buffer = await buildDossierPdf(document, meta, { compress: false });
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buffer.subarray(-6).toString()).toContain('%%EOF');
  });

  it('trae el folio, la estancia de origen y los datos generales del infante', async () => {
    const text = pdfText(await buildDossierPdf(document, meta, { compress: false }));
    for (const expected of ['EXP-2026-000042', 'Estancia Uno', 'Infante Uno Prueba', 'M-0001', 'AAAA240310MDFXXX01', '2025-03-10', 'Motriz']) {
      expect(text).toContain(expected);
    }
  });

  it('incluye tutores con teléfono, consentimientos, asistencia y el seguimiento con notas y alta médica', async () => {
    const text = pdfText(await buildDossierPdf(document, meta, { compress: false }));
    for (const expected of ['Tutora Prueba', '5512345678', 'CONTACTO_TELEFONICO', 'AP-2026-1', 'PRESENTE', 'Fiebre desde ayer', 'ALTA-0042', 'Sin fiebre desde hace 48 h.', 'ENF_CASA']) {
      expect(text).toContain(expected);
    }
  });

  it('cada página lleva el folio y su numeración, y la última el sello completo y la huella del contenido', async () => {
    const raw = await buildDossierPdf(document, meta, { compress: false });
    const text = pdfText(raw);
    const pages = (raw.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;
    for (let page = 1; page <= pages; page += 1) expect(text).toContain(`Página ${page} de ${pages}`);
    expect(text.split('EXP-2026-000042').length - 1).toBeGreaterThanOrEqual(pages);
    expect(text).toContain(SEAL);
    expect(text).toContain('cd'.repeat(32));
  });

  it('reparte un expediente largo en varias páginas sin perder el sello', async () => {
    const manyFollowUps = Array.from({ length: 60 }, (_, index) => ({ ...(document.followUps[0] as DossierDocument['followUps'][number]), absenceDate: `2026-10-${String((index % 28) + 1).padStart(2, '0')}` }));
    const raw = await buildDossierPdf({ ...document, followUps: manyFollowUps }, meta, { compress: false });
    const pages = (raw.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;
    expect(pages).toBeGreaterThan(3);
    expect(pdfText(raw)).toContain(`Página ${pages} de ${pages}`);
    expect(pdfText(raw)).toContain(SEAL);
  });

  it('un infante sin discapacidad, sin tutores ni seguimientos igual genera un expediente', async () => {
    const empty: DossierDocument = { ...document, child: { ...document.child, hasDisability: false, disabilityGroup: null, curp: null }, guardians: [], consents: [], followUps: [], movements: [], attendance: [] };
    const text = pdfText(await buildDossierPdf(empty, meta, { compress: false }));
    expect(text).toContain('Sin tutores registrados');
    expect(text).toContain('Sin seguimientos');
    expect(text).not.toContain('Motriz');
  });
});
