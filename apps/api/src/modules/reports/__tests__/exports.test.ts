import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { buildPdf } from '../exports/pdf-builder.js';
import { buildWorkbook } from '../exports/xlsx-builder.js';
import type { PeriodReport } from '../reports.types.js';
import { buildPeriodReport } from '../services/period-report.js';

const report: PeriodReport = buildPeriodReport(
  'MONTH',
  { from: '2026-10-01', to: '2026-10-31' },
  [
    { estanciaId: 1, code: 'EBDI-01', name: 'Estancia Uno', region: 'Norte' },
    { estanciaId: 2, code: 'EBDI-02', name: 'Estancia Dos', region: null },
  ],
  [
    { estanciaId: 1, date: '2026-10-01', present: 18, absent: 2, other: 0 },
    { estanciaId: 1, date: '2026-10-02', present: 19, absent: 1, other: 0 },
  ],
  new Date('2026-11-01T12:00:00Z'),
);

const sheetValues = (sheet: ExcelJS.Worksheet): unknown[][] => {
  const rows: unknown[][] = [];
  sheet.eachRow((row) => rows.push((row.values as unknown[]).slice(1)));
  return rows;
};

/** Texto de un PDF sin comprimir: PDFKit escribe cada cadena en hexadecimal y partida por ajustes de espacio. */
const pdfText = (buffer: Buffer): string =>
  [...buffer.toString('latin1').matchAll(/\[([^\]]*)\] TJ/g)]
    .map((match) => [...(match[1] ?? '').matchAll(/<([0-9a-f]*)>/gi)].map((hex) => Buffer.from(hex[1] ?? '', 'hex').toString('latin1')).join(''))
    .join('\n');

/** ExcelJS tipa su propio `Buffer`; el de Node es compatible en ejecución. */
const load = (workbook: ExcelJS.Workbook, buffer: Buffer): Promise<ExcelJS.Workbook> => workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);

describe('buildWorkbook (Excel)', () => {
  it('genera un libro válido con las hojas Resumen y Detalle', async () => {
    const buffer = await buildWorkbook(report);
    const workbook = new ExcelJS.Workbook();
    await load(workbook, buffer);
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['Resumen', 'Detalle diario']);
  });

  it('el resumen trae una fila por estancia con sus conteos y la fila de totales', async () => {
    const workbook = new ExcelJS.Workbook();
    await load(workbook, await buildWorkbook(report));
    const rows = sheetValues(workbook.getWorksheet('Resumen') as ExcelJS.Worksheet);
    const header = rows.find((row) => row[0] === 'Clave');
    expect(header).toEqual(['Clave', 'Estancia', 'Región', 'Días con jornada', 'Registros', 'Presentes', 'Ausentes', 'Otros', 'Asistencia', 'Semáforo']);
    const one = rows.find((row) => row[0] === 'EBDI-01');
    expect(one).toEqual(['EBDI-01', 'Estancia Uno', 'Norte', 2, 40, 37, 3, 0, 0.925, 'Verde']);
    expect(rows.find((row) => row[0] === 'EBDI-02')).toEqual(['EBDI-02', 'Estancia Dos', '—', 0, 0, 0, 0, 0, undefined, 'Sin captura']);
    expect(rows.find((row) => row[0] === 'Total')?.slice(3, 8)).toEqual([2, 40, 37, 3, 0]);
  });

  it('el detalle trae una fila por estancia y día', async () => {
    const workbook = new ExcelJS.Workbook();
    await load(workbook, await buildWorkbook(report));
    const rows = sheetValues(workbook.getWorksheet('Detalle diario') as ExcelJS.Worksheet);
    expect(rows.filter((row) => row[0] === '2026-10-01' || row[0] === '2026-10-02')).toHaveLength(2);
  });

  it('el libro no contiene nombres de infantes ni datos de contacto', async () => {
    const buffer = await buildWorkbook(report);
    expect(buffer.toString('latin1')).not.toMatch(/curp|matr[ií]cula|tel[eé]fono/i);
  });
});

describe('buildPdf', () => {
  it('genera un PDF válido', async () => {
    const buffer = await buildPdf(report, { compress: false });
    expect(buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(buffer.subarray(-6).toString()).toContain('%%EOF');
  });

  it('muestra el corte, las estancias y los totales', async () => {
    const text = pdfText(await buildPdf(report, { compress: false }));
    expect(text).toContain('Estancia Uno');
    expect(text).toContain('Estancia Dos');
    expect(text).toContain('2026-10-01');
    expect(text).toContain('2026-10-31');
    expect(text).toContain('92.5');
  });

  it('cada fila trae otros (comisión médica y filtro sanitario), para que presentes, ausentes y otros sumen los registros', async () => {
    const withOthers = buildPeriodReport(
      'DAY',
      { from: '2026-10-01', to: '2026-10-01' },
      [
        { estanciaId: 3, code: 'EBDI-03', name: 'Estancia Tres', region: 'Sur' },
        { estanciaId: 4, code: 'EBDI-04', name: 'Estancia Cuatro', region: 'Norte' },
      ],
      [
        { estanciaId: 3, date: '2026-10-01', present: 15, absent: 2, other: 3 },
        { estanciaId: 4, date: '2026-10-01', present: 9, absent: 0, other: 1 },
      ],
      new Date('2026-10-02T12:00:00Z'),
    );
    const lines = pdfText(await buildPdf(withOthers, { compress: false })).split('\n');
    const cellsOf = (first: string): string[] => lines.slice(lines.indexOf(first), lines.indexOf(first) + 8);
    expect(cellsOf('Clave')).toEqual(['Clave', 'Estancia', 'Reg.', 'Reg. capt.', 'Pres.', 'Aus.', 'Otros', 'Asist.']);
    expect(cellsOf('EBDI-03')).toEqual(['EBDI-03', 'Estancia Tres', 'Sur', '20', '15', '2', '3', '75.0 %']);
    expect(cellsOf('EBDI-04')).toEqual(['EBDI-04', 'Estancia Cuatro', 'Norte', '10', '9', '0', '1', '90.0 %']);
  });

  it('numera las páginas y reparte las estancias cuando no caben en una', async () => {
    const many = buildPeriodReport(
      'MONTH',
      { from: '2026-10-01', to: '2026-10-31' },
      Array.from({ length: 212 }, (_, i) => ({ estanciaId: i + 1, code: `EBDI-${i + 1}`, name: `Estancia ${i + 1}`, region: 'Norte' })),
      [],
      new Date('2026-11-01T12:00:00Z'),
    );
    const raw = await buildPdf(many, { compress: false });
    const text = pdfText(raw);
    const pages = (raw.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length;
    expect(pages).toBeGreaterThan(3);
    expect(text).toContain(`Página ${pages} de ${pages}`);
  });

  it('no contiene nada identificable de infantes', async () => {
    const text = pdfText(await buildPdf(report, { compress: false }));
    expect(text).not.toMatch(/curp|matr[ií]cula|tel[eé]fono/i);
  });
});
