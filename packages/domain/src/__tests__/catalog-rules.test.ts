import { describe, expect, it } from 'vitest';
import { canChangeRoomShift, canRetireEstancia, canRetireRoom, isValidTimeZone, roomHasSpace, roomCapacityAllows } from '../catalog-rules.js';

describe('isValidTimeZone (RF-31)', () => {
  it('acepta zonas horarias IANA', () => {
    for (const zone of ['America/Mexico_City', 'America/Tijuana', 'UTC']) expect(isValidTimeZone(zone)).toBe(true);
  });

  it('rechaza nombres que no existen o vacíos', () => {
    for (const zone of ['', 'Mexico', 'America/Nowhere', 'GMT+99']) expect(isValidTimeZone(zone)).toBe(false);
  });
});

describe('reglas de una sala (RF-32)', () => {
  it('una sala con inscritos activos no se da de baja ni se desactiva', () => {
    expect(canRetireRoom(0)).toBe(true);
    expect(canRetireRoom(1)).toBe(false);
  });

  it('el turno solo cambia si no hay inscritos, porque las jornadas son por turno', () => {
    expect(canChangeRoomShift(0)).toBe(true);
    expect(canChangeRoomShift(3)).toBe(false);
  });

  it('la capacidad no puede quedar por debajo de los inscritos', () => {
    expect(roomCapacityAllows(null, 40)).toBe(true);
    expect(roomCapacityAllows(15, 15)).toBe(true);
    expect(roomCapacityAllows(14, 15)).toBe(false);
  });

  it('una sala llena no admite otra inscripción; sin capacidad definida siempre hay lugar', () => {
    expect(roomHasSpace(15, 14)).toBe(true);
    expect(roomHasSpace(15, 15)).toBe(false);
    expect(roomHasSpace(null, 500)).toBe(true);
  });
});

describe('canRetireEstancia (RF-31)', () => {
  it('una estancia sin inscritos activos ni jornadas abiertas se puede dar de baja', () => {
    expect(canRetireEstancia({ activeEnrollments: 0, openJourneys: 0 })).toEqual({ ok: true });
  });

  it('con inscritos activos o jornadas abiertas no, y dice por qué', () => {
    expect(canRetireEstancia({ activeEnrollments: 4, openJourneys: 0 })).toEqual({ ok: false, reason: 'CON_INSCRITOS' });
    expect(canRetireEstancia({ activeEnrollments: 0, openJourneys: 1 })).toEqual({ ok: false, reason: 'CON_JORNADAS_ABIERTAS' });
    expect(canRetireEstancia({ activeEnrollments: 4, openJourneys: 1 })).toEqual({ ok: false, reason: 'CON_INSCRITOS' });
  });
});
