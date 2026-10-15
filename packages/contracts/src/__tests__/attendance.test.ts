import { describe, expect, it } from 'vitest';
import { attendanceJourneySchema, openAttendanceJourneyRequestSchema } from '../attendance/journey.js';

describe('contratos de jornadas de asistencia', () => {
  it('acepta fecha y turno válidos', () => {
    expect(openAttendanceJourneyRequestSchema.parse({ date: '2026-10-15', shift: 'MATUTINO' })).toEqual({ date: '2026-10-15', shift: 'MATUTINO' });
  });

  it('rechaza fechas y turnos fuera del dominio', () => {
    expect(openAttendanceJourneyRequestSchema.safeParse({ date: '15/10/2026', shift: 'MATUTINO' }).success).toBe(false);
    expect(openAttendanceJourneyRequestSchema.safeParse({ date: '2026-10-15', shift: 'NOCTURNO' }).success).toBe(false);
  });

  it('exige fecha de cierre en jornadas cerradas', () => {
    const base = { id: 1, estanciaId: 7, date: '2026-10-15', shift: 'MATUTINO', openedAt: '2026-10-15T13:00:00.000Z' };
    expect(attendanceJourneySchema.safeParse({ ...base, status: 'ABIERTA', closedAt: null }).success).toBe(true);
    expect(attendanceJourneySchema.safeParse({ ...base, status: 'CERRADA', closedAt: null }).success).toBe(false);
  });
});
