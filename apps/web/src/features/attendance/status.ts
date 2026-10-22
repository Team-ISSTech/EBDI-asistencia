import type { AttendanceStatus, IncidentType } from '@sirai/domain';

/** Nombres para personas; los códigos son para programas. */
export const STATUS_LABELS: Readonly<Record<AttendanceStatus, string>> = {
  PRESENTE: 'Presente',
  AUSENTE_JUSTIFICADO: 'Ausente justificado',
  FALTA_INJUSTIFICADA: 'Falta injustificada',
  COMISION_MEDICA: 'Comisión médica',
  FILTRO_SANITARIO: 'Filtro sanitario',
};

/**
 * Texto corto para el control segmentado del pase de lista, donde no caben los nombres completos. Cada uno
 * está contenido en su nombre completo (WCAG 2.5.3), que sigue siendo el nombre accesible.
 */
export const STATUS_SHORT_LABELS: Readonly<Record<AttendanceStatus, string>> = {
  PRESENTE: 'Presente',
  AUSENTE_JUSTIFICADO: 'Justificado',
  FALTA_INJUSTIFICADA: 'Falta',
  COMISION_MEDICA: 'Comisión',
  FILTRO_SANITARIO: 'Filtro',
};

/** El estado elegido se pinta con su color de packages/ui y texto blanco (≥ 4.5:1). Clases literales para Tailwind. */
export const STATUS_SELECTED_CLASSES: Readonly<Record<AttendanceStatus, string>> = {
  PRESENTE: 'bg-[var(--color-presente)] text-white',
  AUSENTE_JUSTIFICADO: 'bg-[var(--color-ausente-justificado)] text-white',
  FALTA_INJUSTIFICADA: 'bg-[var(--color-falta-injustificada)] text-white',
  COMISION_MEDICA: 'bg-[var(--color-comision-medica)] text-white',
  FILTRO_SANITARIO: 'bg-[var(--color-filtro-sanitario)] text-white',
};

export const INCIDENT_LABELS: Readonly<Record<IncidentType, string>> = {
  ACCIDENTE: 'Accidente',
  ENFERMEDAD: 'Enfermedad',
  CONDUCTA: 'Conducta',
  OTRA: 'Otra',
};

/** Hora local `HH:MM` (24 h) de una marca ISO. */
export const timeOf = (iso: string): string => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
