import { describe, expect, it } from 'vitest';
import {
  ABSENCE_CUTOFF_HOUR,
  ABSENCE_STATUSES,
  FOLLOW_UP_CAUSES,
  FOLLOW_UP_STATUSES,
  SECOND_ATTEMPT_DELAY_HOURS,
  cutoffReached,
  generatesFollowUp,
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
