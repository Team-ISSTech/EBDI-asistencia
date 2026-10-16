import ExcelJS from 'exceljs';
import type { PeriodReport } from '../reports.types.js';
import { LIGHT_LABELS, NO_PERSONAL_DATA_NOTE, PERIOD_LABELS } from './labels.js';

const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF143240' } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' } };
const PERCENT_FORMAT = '0.0%';

const styleHeader = (row: ExcelJS.Row): void => {
  row.font = HEADER_FONT;
  row.fill = HEADER_FILL;
};

/** Libro con la hoja de resumen por estancia y el detalle por día. Solo conteos y porcentajes. */
export async function buildWorkbook(report: PeriodReport): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SIRAI';
  workbook.created = report.generatedAt;

  const summary = workbook.addWorksheet('Resumen');
  summary.addRow([`${PERIOD_LABELS[report.period]}: ${report.range.from} a ${report.range.to}`]).font = { bold: true };
  summary.addRow([NO_PERSONAL_DATA_NOTE]);
  summary.addRow([]);
  styleHeader(summary.addRow(['Clave', 'Estancia', 'Región', 'Días con jornada', 'Registros', 'Presentes', 'Ausentes', 'Otros', 'Asistencia', 'Semáforo']));
  for (const row of report.summary) {
    summary.addRow([row.code, row.name, row.region ?? '—', row.days, row.marks, row.present, row.absent, row.other, row.rate, LIGHT_LABELS[row.light]]);
  }
  const t = report.totals;
  summary.addRow(['Total', `${t.estancias} estancias`, '', t.days, t.marks, t.present, t.absent, t.other, t.rate, '']).font = { bold: true };
  summary.getColumn(9).numFmt = PERCENT_FORMAT;
  summary.columns.forEach((column, index) => {
    column.width = index === 1 ? 34 : 16;
  });

  const detail = workbook.addWorksheet('Detalle diario');
  styleHeader(detail.addRow(['Fecha', 'Clave', 'Estancia', 'Presentes', 'Ausentes', 'Otros', 'Asistencia']));
  for (const row of report.details) detail.addRow([row.date, row.code, row.name, row.present, row.absent, row.other, row.rate]);
  detail.getColumn(7).numFmt = PERCENT_FORMAT;
  detail.columns.forEach((column, index) => {
    column.width = index === 2 ? 34 : 14;
  });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
