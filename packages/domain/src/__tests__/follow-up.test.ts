import { describe, expect, it } from 'vitest';
import {
  ABSENCE_CUTOFF_HOUR,
  ABSENCE_STATUSES,
  FOLLOW_UP_CAUSES,
  FOLLOW_UP_STATUSES,
  SECOND_ATTEMPT_DELAY_HOURS,
  applyContact,
  cutoffReached,
  generatesFollowUp,
  isEmergencyAlert,
  requiresMedicalRelease,
  secondAttemptDueAt,
} from '../follow-up.js';

describe('catálogos del seguimiento', () => {
  it('las causas son las cuatro del SRS (RF-26)', () => {
    expect(FOLLOW_UP_CAUSES).toEqual(['ENF_CASA', 'ACC_EXT', 'PER_TUT', 'NO_LOC']);
  });

  it('el ticket nace abierto y se cierra al terminar el caso', () => {
    expect(FOLLOW_UP_STATUSES).toEqual(['ABIERTO', 'CLASIFICADO', 'CERRADO']);
  });
});

describe('generatesFollowUp (S-08)', () => {
  it('solo las ausencias generan ticket', () => {
    expect(ABSENCE_STATUSES).toEqual(['AUSENTE_JUSTIFICADO', 'FALTA_INJUSTIFICADA']);
    expect(generatesFollowUp('FALTA_INJUSTIFICADA')).toBe(true);
    expect(generatesFollowUp('AUSENTE_JUSTIFICADO')).toBe(true);
  });

  it('presente, comisión médica y filtro sanitario no generan ticket', () => {
    for (const status of ['PRESENTE', 'COMISION_MEDICA', 'FILTRO_SANITARIO'] as const) {
      expect(generatesFollowUp(status)).toBe(false);
    }
  });
});

describe('requiresMedicalRelease (RF-29)', () => {
  it('enfermedad y accidente activan el candado médico', () => {
    expect(requiresMedicalRelease('ENF_CASA')).toBe(true);
    expect(requiresMedicalRelease('ACC_EXT')).toBe(true);
  });

  it('un permiso o no localizar al tutor no lo activan', () => {
    expect(requiresMedicalRelease('PER_TUT')).toBe(false);
    expect(requiresMedicalRelease('NO_LOC')).toBe(false);
  });
});

describe('secondAttemptDueAt (RF-27)', () => {
  it('programa el segundo intento cuatro horas después del primero', () => {
    expect(SECOND_ATTEMPT_DELAY_HOURS).toBe(4);
    expect(secondAttemptDueAt(new Date('2026-10-15T15:00:00Z')).toISOString()).toBe('2026-10-15T19:00:00.000Z');
  });
});

describe('cutoffReached (RF-24 y S-07)', () => {
  it('el cierre es a las 09:00', () => {
    expect(ABSENCE_CUTOFF_HOUR).toBe(9);
  });

  it('se evalúa en la zona horaria de la estancia, no en UTC', () => {
    // 14:59 UTC = 08:59 en Ciudad de México (UTC-6 en octubre de 2026)
    expect(cutoffReached(new Date('2026-10-15T14:59:00Z'), 'America/Mexico_City', '2026-10-15')).toBe(false);
    expect(cutoffReached(new Date('2026-10-15T15:00:00Z'), 'America/Mexico_City', '2026-10-15')).toBe(true);
  });

  it('distingue zonas horarias distintas en el mismo instante', () => {
    const instant = new Date('2026-10-15T15:00:00Z');
    expect(cutoffReached(instant, 'America/Mexico_City', '2026-10-15')).toBe(true);
    expect(cutoffReached(instant, 'America/Tijuana', '2026-10-15')).toBe(false);
  });

  it('una jornada de un día anterior ya pasó su cierre', () => {
    expect(cutoffReached(new Date('2026-10-16T01:00:00Z'), 'America/Mexico_City', '2026-10-15')).toBe(true);
  });

  it('una jornada de un día futuro no ha llegado a su cierre', () => {
    expect(cutoffReached(new Date('2026-10-15T20:00:00Z'), 'America/Mexico_City', '2026-10-16')).toBe(false);
  });
});

describe('applyContact (RF-25 a RF-29)', () => {
  const fresh = { cause: null, requiresMedicalRelease: false, expectedReturnDate: null, failedAttempts: 0 } as const;
  const at = new Date('2026-10-15T16:00:00Z');

  it('un contacto por enfermedad clasifica el ticket, pide la fecha de retorno y activa el candado médico', () => {
    const result = applyContact(fresh, { result: 'CONTACTADO', cause: 'ENF_CASA', expectedReturnDate: '2026-10-20', at });
    expect(result).toEqual({
      ok: true,
      state: { status: 'CLASIFICADO', cause: 'ENF_CASA', requiresMedicalRelease: true, expectedReturnDate: '2026-10-20', failedAttempts: 0, nextAttemptAt: null, emergencyAlert: false },
    });
  });

  it('un accidente también activa el candado; un permiso no', () => {
    const accident = applyContact(fresh, { result: 'CONTACTADO', cause: 'ACC_EXT', expectedReturnDate: '2026-10-25', at });
    const permit = applyContact(fresh, { result: 'CONTACTADO', cause: 'PER_TUT', expectedReturnDate: '2026-10-16', at });
    expect(accident.ok && accident.state.requiresMedicalRelease).toBe(true);
    expect(permit.ok && permit.state.requiresMedicalRelease).toBe(false);
  });

  it('contactar al tutor exige causa y fecha de retorno, y la causa no puede ser NO_LOC', () => {
    expect(applyContact(fresh, { result: 'CONTACTADO', at })).toEqual({ ok: false, reason: 'CAUSA_REQUERIDA' });
    expect(applyContact(fresh, { result: 'CONTACTADO', cause: 'ENF_CASA', at })).toEqual({ ok: false, reason: 'RETORNO_REQUERIDO' });
    expect(applyContact(fresh, { result: 'CONTACTADO', cause: 'NO_LOC', expectedReturnDate: '2026-10-20', at })).toEqual({ ok: false, reason: 'CAUSA_NO_VALIDA' });
  });

  it('no localizar al tutor clasifica NO_LOC y programa el segundo intento a las 4 horas', () => {
    const result = applyContact(fresh, { result: 'SIN_RESPUESTA', at });
    expect(result).toEqual({
      ok: true,
      state: { status: 'CLASIFICADO', cause: 'NO_LOC', requiresMedicalRelease: false, expectedReturnDate: null, failedAttempts: 1, nextAttemptAt: new Date('2026-10-15T20:00:00Z'), emergencyAlert: false },
    });
  });

  it('el segundo intento sin respuesta activa la alerta a los contactos de emergencia y ya no programa otro', () => {
    const second = applyContact({ ...fresh, cause: 'NO_LOC', failedAttempts: 1 }, { result: 'SIN_RESPUESTA', at });
    expect(second.ok && second.state).toMatchObject({ cause: 'NO_LOC', failedAttempts: 2, emergencyAlert: true, nextAttemptAt: null });
  });

  it('una llamada sin respuesta no reclasifica un caso ya clasificado', () => {
    const state = { cause: 'ENF_CASA', requiresMedicalRelease: true, expectedReturnDate: '2026-10-20', failedAttempts: 0 } as const;
    const result = applyContact(state, { result: 'SIN_RESPUESTA', at });
    expect(result.ok && result.state).toMatchObject({ cause: 'ENF_CASA', requiresMedicalRelease: true, expectedReturnDate: '2026-10-20', failedAttempts: 1, nextAttemptAt: null });
  });

  it('contactar después de no localizar al tutor reclasifica y apaga el segundo intento', () => {
    const result = applyContact({ ...fresh, cause: 'NO_LOC', failedAttempts: 1 }, { result: 'CONTACTADO', cause: 'PER_TUT', expectedReturnDate: '2026-10-16', at });
    expect(result.ok && result.state).toMatchObject({ cause: 'PER_TUT', emergencyAlert: false, nextAttemptAt: null });
  });
});

describe('isEmergencyAlert', () => {
  it('se activa con dos intentos fallidos y la causa NO_LOC', () => {
    expect(isEmergencyAlert('NO_LOC', 2)).toBe(true);
    expect(isEmergencyAlert('NO_LOC', 1)).toBe(false);
    expect(isEmergencyAlert('ENF_CASA', 3)).toBe(false);
    expect(isEmergencyAlert(null, 3)).toBe(false);
  });
});
