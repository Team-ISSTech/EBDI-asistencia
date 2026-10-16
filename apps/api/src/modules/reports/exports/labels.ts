import type { ReportPeriod, TrafficLight } from '@sirai/domain';

export const PERIOD_LABELS: Readonly<Record<ReportPeriod, string>> = { DAY: 'Corte diario', MONTH: 'Corte mensual', QUARTER: 'Corte trimestral' };

export const LIGHT_LABELS: Readonly<Record<TrafficLight, string>> = { VERDE: 'Verde', AMARILLO: 'Amarillo', ROJO: 'Rojo', SIN_CAPTURA: 'Sin captura' };

/** Texto para PDF o pantalla: 92.5 %; sin tasa, un guion. */
export const percent = (rate: number | null): string => (rate === null ? '—' : `${(rate * 100).toFixed(1)} %`);

export const NO_PERSONAL_DATA_NOTE = 'Solo cifras agregadas: este reporte no contiene datos identificables de infantes ni tutores.';
