import type { ExportFormat } from '@sirai/contracts';
import { REPORT_PERIODS, type ReportPeriod } from '@sirai/domain';
import { Button, Select } from '@sirai/ui';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { downloadReport } from './api';

const PERIOD_LABELS: Readonly<Record<ReportPeriod, string>> = { DAY: 'Diario', MONTH: 'Mensual', QUARTER: 'Trimestral' };

/** Entrega el archivo al navegador como una descarga. */
const save = ({ blob, filename }: { blob: Blob; filename: string }): void => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

export interface ExportBarProps {
  /** Fecha elegida en el tablero; el corte es el diario, mensual o trimestral que la contiene. */
  readonly date: string;
}

/** Exportación del corte a Excel o PDF (RF-17): solo cifras agregadas, acotadas al alcance del usuario. */
export function ExportBar({ date }: ExportBarProps) {
  const [period, setPeriod] = useState<ReportPeriod>('DAY');
  const download = useMutation({ mutationFn: (format: ExportFormat) => downloadReport(period, date, format), onSuccess: save });

  return (
    <div className="mb-6 flex flex-wrap items-end gap-4">
      <Select label="Corte" value={period} onChange={(event) => setPeriod(event.target.value as ReportPeriod)}>
        {REPORT_PERIODS.map((option) => (
          <option key={option} value={option}>
            {PERIOD_LABELS[option]}
          </option>
        ))}
      </Select>
      <Button variant="ghost" loading={download.isPending && download.variables === 'xlsx'} onClick={() => download.mutate('xlsx')}>
        Descargar Excel
      </Button>
      <Button variant="ghost" loading={download.isPending && download.variables === 'pdf'} onClick={() => download.mutate('pdf')}>
        Descargar PDF
      </Button>
      {download.isError ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          No se pudo descargar el reporte.
        </p>
      ) : null}
    </div>
  );
}
