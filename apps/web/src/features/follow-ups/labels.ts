import type { AttendanceStatus, FollowUpCause } from '@sirai/domain';

export const CAUSE_LABELS: Readonly<Record<FollowUpCause, string>> = {
  ENF_CASA: 'Enfermedad en casa',
  ACC_EXT: 'Accidente fuera del plantel',
  PER_TUT: 'Permiso del tutor',
  NO_LOC: 'Sin respuesta del tutor',
};

export const ABSENCE_LABELS: Readonly<Partial<Record<AttendanceStatus, string>>> = {
  AUSENTE_JUSTIFICADO: 'Ausente justificado',
  FALTA_INJUSTIFICADA: 'Falta injustificada',
};
