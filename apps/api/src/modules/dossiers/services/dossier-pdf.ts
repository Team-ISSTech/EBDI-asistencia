import PDFDocument from 'pdfkit';
import type { DossierDocument } from '../dossiers.types.js';

export interface DossierSealInfo {
  readonly folio: string;
  /** Sello en hexadecimal (HMAC-SHA256, 64 caracteres). */
  readonly seal: string;
  /** Huella SHA-256 del contenido del expediente, en hexadecimal. */
  readonly contentSha256: string;
  readonly issuedAt: Date;
}

export interface DossierPdfOptions {
  /** Desactivar solo en pruebas, para poder leer el texto del PDF. */
  readonly compress?: boolean;
}

const MARGIN = 50;
const FOOTER_OFFSET = 30;
const SHORT_SEAL = 16;

const yesNo = (value: boolean): string => (value ? 'Sí' : 'No');
const date = (iso: string | null): string => (iso === null ? '—' : iso.slice(0, 10));
const dateTime = (iso: string): string => iso.slice(0, 16).replace('T', ' ');

type Doc = InstanceType<typeof PDFDocument>;

const section = (doc: Doc, title: string): void => {
  doc.moveDown(0.8);
  doc.font('Helvetica-Bold').fontSize(12).fillColor('#143240').text(title).fillColor('#000000');
  doc.moveDown(0.3);
};
const line = (doc: Doc, text: string, bold = false): void => {
  doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9).text(text);
};
const empty = (doc: Doc, text: string): void => {
  doc.font('Helvetica-Oblique').fontSize(9).fillColor('#555555').text(text).fillColor('#000000');
};

const writeHeader = (doc: Doc, content: DossierDocument, seal: DossierSealInfo): void => {
  doc.font('Helvetica-Bold').fontSize(18).text('Expediente de seguimiento integral');
  doc.font('Helvetica').fontSize(10).text(`Folio ${seal.folio}`);
  doc.text(`Estancia de origen: ${content.estancia.name} (${content.estancia.code})`);
  doc.text(`Emitido: ${seal.issuedAt.toISOString()}`);
  doc.fontSize(8).fillColor('#555555').text('Documento confidencial: contiene datos personales sensibles de un menor. Su uso se limita al traslado entre estancias.').fillColor('#000000');
};

const writeGeneral = (doc: Doc, { child }: DossierDocument): void => {
  section(doc, 'Datos generales');
  line(doc, `Nombre: ${child.fullName}`, true);
  line(doc, `Matrícula: ${child.enrollmentNumber}   CURP: ${child.curp ?? '—'}`);
  line(doc, `Fecha de nacimiento: ${child.birthDate}   Género: ${child.gender ?? '—'}   Estatus: ${child.status}`);
  line(doc, `Discapacidad: ${yesNo(child.hasDisability)}${child.disabilityGroup ? ` (${child.disabilityGroup})` : ''}`);
};

const writeEnrollments = (doc: Doc, content: DossierDocument): void => {
  section(doc, 'Inscripciones y movimientos');
  if (content.enrollments.length === 0) empty(doc, 'Sin inscripciones.');
  for (const e of content.enrollments) line(doc, `${e.estanciaName} · ${e.roomName} · ciclo ${e.schoolYear} · ${e.startDate} a ${date(e.endDate)} · ${e.status}`);
  for (const m of content.movements) line(doc, `  ${dateTime(m.occurredAt)}  ${m.type}${m.reason ? `: ${m.reason}` : ''}`);
};

const guardianFlags = (g: DossierDocument['guardians'][number]): string =>
  `${g.isPrimary ? ' · principal' : ''}${g.canPickUp ? ' · puede recoger' : ''}${g.isEmergencyContact ? ' · contacto de emergencia' : ''}`;

const writeGuardians = (doc: Doc, content: DossierDocument): void => {
  section(doc, 'Tutores y contactos');
  if (content.guardians.length === 0) empty(doc, 'Sin tutores registrados.');
  for (const g of content.guardians) {
    line(doc, `${g.fullName} (${g.relationship})${guardianFlags(g)}`, true);
    line(doc, `  Teléfono: ${g.phone ?? '—'}   Vigencia: ${g.validFrom} a ${date(g.validUntil)}`);
  }
};

const writeConsents = (doc: Doc, content: DossierDocument): void => {
  section(doc, 'Consentimientos');
  if (content.consents.length === 0) empty(doc, 'Sin consentimientos registrados.');
  for (const c of content.consents) {
    line(doc, `${c.type} · aviso ${c.noticeVersion} · ${c.accepted ? 'aceptado' : 'rechazado'} ${dateTime(c.acceptedAt)}${c.revokedAt ? ` · revocado ${dateTime(c.revokedAt)}` : ''}`);
  }
};

const writeAttendance = (doc: Doc, content: DossierDocument): void => {
  section(doc, 'Asistencia (resumen)');
  if (content.attendance.length === 0) empty(doc, 'Sin registros de asistencia.');
  for (const entry of content.attendance) line(doc, `${entry.status}: ${entry.total}`);
};

const writeFollowUp = (doc: Doc, followUp: DossierDocument['followUps'][number]): void => {
  line(doc, `Ausencia del ${followUp.absenceDate} (${followUp.absenceStatus}) · ${followUp.status} · causa ${followUp.cause ?? 'sin clasificar'} · retorno ${date(followUp.expectedReturnDate)}${followUp.requiresMedicalRelease ? ' · requirió alta médica' : ''}`, true);
  for (const contact of followUp.contacts) {
    line(doc, `  Intento ${contact.attemptNumber} (${dateTime(contact.occurredAt)}): ${contact.result}${contact.guardianName ? ` con ${contact.guardianName}` : ''}`);
    if (contact.notes) line(doc, `    Notas: ${contact.notes}`);
  }
  const release = followUp.release;
  if (release) line(doc, `  Alta médica ${date(release.dischargeDate)}${release.folio ? ` · folio ${release.folio}` : ''}${release.observations ? `: ${release.observations}` : ''}`);
};

const writeFollowUps = (doc: Doc, content: DossierDocument): void => {
  section(doc, 'Seguimientos de ausencias');
  if (content.followUps.length === 0) empty(doc, 'Sin seguimientos.');
  for (const followUp of content.followUps) writeFollowUp(doc, followUp);
};

const writeSeal = (doc: Doc, seal: DossierSealInfo): void => {
  section(doc, 'Sello de autenticidad');
  line(doc, `Folio: ${seal.folio}`);
  line(doc, `Sello: ${seal.seal}`);
  line(doc, `Huella SHA-256 del contenido: ${seal.contentSha256}`);
  empty(doc, 'Para comprobar que este documento es auténtico, verifica el folio y el sello en SIRAI (Expedientes > Verificar).');
};

/** Folio, número de página y sello abreviado al pie de cada hoja. */
const writeFooters = (doc: Doc, seal: DossierSealInfo): void => {
  const pages = doc.bufferedPageRange();
  for (let index = 0; index < pages.count; index += 1) {
    doc.switchToPage(pages.start + index);
    doc.page.margins.bottom = 0;
    doc.font('Helvetica').fontSize(8).fillColor('#555555').text(
      `Folio ${seal.folio} · Página ${index + 1} de ${pages.count} · Sello ${seal.seal.slice(0, SHORT_SEAL)}…`,
      MARGIN,
      doc.page.height - FOOTER_OFFSET,
      { width: doc.page.width - 2 * MARGIN, align: 'center', lineBreak: false },
    );
  }
};

/**
 * Expediente de un infante en PDF para un traslado (RF-19): foliado (folio y
 * "Página x de y" en cada hoja) y sellado (sello HMAC y huella del contenido
 * en la última). El contenido ya llega descifrado: quien lo emite tiene
 * permiso para ver notas y datos de contacto.
 */
export function buildDossierPdf(content: DossierDocument, seal: DossierSealInfo, options: DossierPdfOptions = {}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margin: MARGIN,
      bufferPages: true,
      compress: options.compress ?? true,
      info: { Title: `Expediente ${seal.folio}`, Author: 'SIRAI', Subject: 'Expediente de seguimiento integral de un infante' },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    writeHeader(doc, content, seal);
    writeGeneral(doc, content);
    writeEnrollments(doc, content);
    writeGuardians(doc, content);
    writeConsents(doc, content);
    writeAttendance(doc, content);
    writeFollowUps(doc, content);
    writeSeal(doc, seal);
    writeFooters(doc, seal);
    doc.end();
  });
}
