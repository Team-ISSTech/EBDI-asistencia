import { type DashboardResponse, dashboardResponseSchema, type ExportFormat } from '@sirai/contracts';
import type { ReportPeriod } from '@sirai/domain';
import { apiDownload, apiRequest, type DownloadedFile } from '../../lib/api-client';

export const fetchDashboard = (date: string): Promise<DashboardResponse> => apiRequest(`/reportes/tablero?date=${date}`, { schema: dashboardResponseSchema });

/** Descarga el corte que contiene a `date` en Excel o PDF (RF-17). */
export const downloadReport = (period: ReportPeriod, date: string, format: ExportFormat): Promise<DownloadedFile> =>
  apiDownload(`/reportes/exportacion?period=${period}&date=${date}&format=${format}`, `sirai-asistencia.${format}`);
