import type { AttendanceStatus } from '@sirai/domain';

/** Nombres para personas; los códigos son para programas. */
export const STATUS_LABELS: Readonly<Record<AttendanceStatus, string>> = {
  PRESENTE: 'Presente',
  AUSENTE_JUSTIFICADO: 'Ausente justificado',
  FALTA_INJUSTIFICADA: 'Falta injustificada',
  COMISION_MEDICA: 'Comisión médica',
  FILTRO_SANITARIO: 'Filtro sanitario',
};
