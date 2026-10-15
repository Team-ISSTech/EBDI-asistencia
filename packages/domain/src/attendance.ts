export const ATTENDANCE_STATUSES = [
  'PRESENTE',
  'AUSENTE_JUSTIFICADO',
  'FALTA_INJUSTIFICADA',
  'COMISION_MEDICA',
  'FILTRO_SANITARIO',
] as const;

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const SHIFTS = ['MATUTINO', 'VESPERTINO'] as const;

export type Shift = (typeof SHIFTS)[number];

export const JOURNEY_STATUSES = ['ABIERTA', 'CERRADA'] as const;

export type JourneyStatus = (typeof JOURNEY_STATUSES)[number];

interface JourneyIdentity {
  estanciaId: number;
  date: string;
  shift: Shift;
  openedAt: Date;
}

export interface OpenAttendanceJourney extends JourneyIdentity {
  status: 'ABIERTA';
  closedAt?: never;
}

export interface ClosedAttendanceJourney extends JourneyIdentity {
  status: 'CERRADA';
  closedAt: Date;
}

export type AttendanceJourney = OpenAttendanceJourney | ClosedAttendanceJourney;

export const closeJourney = (journey: AttendanceJourney, closedAt: Date): ClosedAttendanceJourney => {
  if (journey.status === 'CERRADA') {
    throw new Error('La jornada ya está cerrada');
  }

  return { ...journey, status: 'CERRADA', closedAt };
};
