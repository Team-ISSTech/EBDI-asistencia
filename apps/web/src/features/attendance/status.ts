import type { AttendanceStatus, IncidentType } from '@sirai/domain';

/** Nombres para personas; los códigos son para programas. */
export const STATUS_LABELS: Readonly<Record<AttendanceStatus, string>> = {
  PRESENTE: 'Presente',
  AUSENTE_JUSTIFICADO: 'Ausente justificado',
  FALTA_INJUSTIFICADA: 'Falta injustificada',
  COMISION_MEDICA: 'Comisión médica',
  FILTRO_SANITARIO: 'Filtro sanitario',
};

export const INCIDENT_LABELS: Readonly<Record<IncidentType, string>> = {
  ACCIDENTE: 'Accidente',
  ENFERMEDAD: 'Enfermedad',
  CONDUCTA: 'Conducta',
  OTRA: 'Otra',
};

/** Hora local `HH:MM` (24 h) de una marca ISO. */
export const timeOf = (iso: string): string => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
