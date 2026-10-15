import { describe, expect, it } from 'vitest';
import {
  ATTENDANCE_STATUSES,
  JOURNEY_STATUSES,
  SHIFTS,
  closeJourney,
  type AttendanceJourney,
} from '../attendance.js';

describe('reglas de asistencia', () => {
  it('define únicamente los cinco estados requeridos por RF-14', () => {
    expect(ATTENDANCE_STATUSES).toEqual([
      'PRESENTE',
      'AUSENTE_JUSTIFICADO',
      'FALTA_INJUSTIFICADA',
      'COMISION_MEDICA',
      'FILTRO_SANITARIO',
    ]);
  });

  it('fija los turnos y estados de jornada fuera de MySQL', () => {
    expect(SHIFTS).toEqual(['MATUTINO', 'VESPERTINO']);
    expect(JOURNEY_STATUSES).toEqual(['ABIERTA', 'CERRADA']);
  });

  it('cierra una jornada abierta conservando su identidad', () => {
    const journey: AttendanceJourney = {
      estanciaId: 7,
      date: '2026-10-15',
      shift: 'MATUTINO',
      status: 'ABIERTA',
      openedAt: new Date('2026-10-15T13:00:00.000Z'),
    };
    const closedAt = new Date('2026-10-15T15:00:00.000Z');

    expect(closeJourney(journey, closedAt)).toEqual({ ...journey, status: 'CERRADA', closedAt });
  });

  it('rechaza cerrar nuevamente una jornada cerrada', () => {
    const journey: AttendanceJourney = {
      estanciaId: 7,
      date: '2026-10-15',
      shift: 'MATUTINO',
      status: 'CERRADA',
      openedAt: new Date('2026-10-15T13:00:00.000Z'),
      closedAt: new Date('2026-10-15T15:00:00.000Z'),
    };

    expect(() => closeJourney(journey, new Date('2026-10-15T16:00:00.000Z'))).toThrow(
      'La jornada ya está cerrada',
    );
  });
});
