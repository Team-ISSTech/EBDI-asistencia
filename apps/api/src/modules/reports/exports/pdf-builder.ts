import PDFDocument from 'pdfkit';
import type { PeriodReport } from '../reports.types.js';
import { LIGHT_LABELS, NO_PERSONAL_DATA_NOTE, PERIOD_LABELS, percent } from './labels.js';

export interface PdfOptions {
  /** Desactivar solo en pruebas, para poder leer el texto del PDF. */
  readonly compress?: boolean;
}

const MARGIN = 40;
const ROW_HEIGHT = 16;
/** Caben en el ancho útil de una hoja carta (612 − 2 × 40 = 532 puntos). */
const COLUMNS = [
  { title: 'Clave', width: 60 },
  { title: 'Estancia', width: 125 },
  { title: 'Reg.', width: 50 },
  { title: 'Reg. capt.', width: 55 },
  { title: 'Pres.', width: 40 },
  { title: 'Aus.', width: 40 },
  { title: 'Otros', width: 40 },
  { title: 'Asist.', width: 50 },
  { title: 'Semáforo', width: 70 },
] as const;

type Cells = readonly string[];

/** PDF con el resumen por estancia y los totales, con encabezado repetido y "Página x de y". */
export function buildPdf(report: PeriodReport, options: PdfOptions = {}): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: MARGIN, bufferPages: true, compress: options.compress ?? true, info: { Title: PERIOD_LABELS[report.period], Author: 'SIRAI' } });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const bottom = (): number => doc.page.height - MARGIN - 30;
    const drawRow = (cells: Cells, bold: boolean): void => {
      let x = MARGIN;
      const y = doc.y;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
      cells.forEach((cell, index) => {
        const column = COLUMNS[index];
        doc.text(cell, x, y, { width: (column?.width ?? 50) - 4, height: ROW_HEIGHT, ellipsis: true, lineBreak: false });
        x += column?.width ?? 50;
      });
      doc.y = y + ROW_HEIGHT;
    };
    const header = (): void => drawRow(COLUMNS.map((column) => column.title), true);

    doc.font('Helvetica-Bold').fontSize(16).text(PERIOD_LABELS[report.period]);
    doc.font('Helvetica').fontSize(10).text(`Periodo: ${report.range.from} a ${report.range.to}`);
    doc.text(`Generado: ${report.generatedAt.toISOString()}`);
    doc.fontSize(8).fillColor('#555555').text(NO_PERSONAL_DATA_NOTE).fillColor('#000000');
    doc.moveDown();

    const t = report.totals;
    doc.font('Helvetica-Bold').fontSize(10).text(`Asistencia global: ${percent(t.rate)}   (${t.present} presentes de ${t.marks} registros en ${t.estancias} estancias)`);
    doc.moveDown();

    header();
    for (const row of report.summary) {
      if (doc.y > bottom()) {
        doc.addPage();
        header();
      }
      drawRow([row.code, row.name, row.region ?? '—', String(row.marks), String(row.present), String(row.absent), String(row.other), percent(row.rate), LIGHT_LABELS[row.light]], false);
    }

    const pages = doc.bufferedPageRange();
    for (let index = 0; index < pages.count; index += 1) {
      doc.switchToPage(pages.start + index);
      doc.font('Helvetica').fontSize(8).text(`Página ${index + 1} de ${pages.count}`, MARGIN, doc.page.height - MARGIN - 10, { width: doc.page.width - 2 * MARGIN, align: 'center', lineBreak: false });
    }
    doc.end();
  });
}
