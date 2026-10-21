import { describe, expect, it } from 'vitest';
import { INCIDENT_TYPES, departureBlocker, incidentBlocker, isAuthorizedPickup, markBlockedByDeparture } from '../departure.js';

const TODAY = '2026-10-20';
const link = { canPickUp: true, validFrom: '2026-08-24', validUntil: null, linkDeleted: false, guardianActive: true };

describe('isAuthorizedPickup', () => {
  it('acepta a un tutor vinculado, vigente, activo y autorizado a recoger', () => {
    expect(isAuthorizedPickup(link, TODAY)).toBe(true);
    expect(isAuthorizedPickup({ ...link, validUntil: TODAY }, TODAY)).toBe(true);
  });

  it('rechaza a quien no está autorizado, ya no es vigente, aún no lo es, fue desvinculado o está dado de baja', () => {
    expect(isAuthorizedPickup({ ...link, canPickUp: false }, TODAY)).toBe(false);
    expect(isAuthorizedPickup({ ...link, validUntil: '2026-10-19' }, TODAY)).toBe(false);
    expect(isAuthorizedPickup({ ...link, validFrom: '2026-10-21' }, TODAY)).toBe(false);
    expect(isAuthorizedPickup({ ...link, linkDeleted: true }, TODAY)).toBe(false);
    expect(isAuthorizedPickup({ ...link, guardianActive: false }, TODAY)).toBe(false);
  });
});

describe('departureBlocker', () => {
  it('solo registra la salida de un infante que ingresó y aún no ha salido', () => {
    expect(departureBlocker({ status: 'PRESENTE', leftAt: null })).toBeNull();
    expect(departureBlocker(null)).toBe('SIN_INGRESO');
    expect(departureBlocker({ status: 'FALTA_INJUSTIFICADA', leftAt: null })).toBe('SIN_INGRESO');
    expect(departureBlocker({ status: 'PRESENTE', leftAt: new Date() })).toBe('YA_SALIO');
  });
});

describe('incidentBlocker', () => {
  it('solo registra incidencias de un infante que ingresó, aunque ya haya salido', () => {
    expect(incidentBlocker({ status: 'PRESENTE', leftAt: null })).toBeNull();
    expect(incidentBlocker({ status: 'PRESENTE', leftAt: new Date() })).toBeNull();
    expect(incidentBlocker(null)).toBe('SIN_INGRESO');
    expect(incidentBlocker({ status: 'COMISION_MEDICA', leftAt: null })).toBe('SIN_INGRESO');
  });
});

describe('markBlockedByDeparture', () => {
  it('tras la salida no se cambia el estado; repetir Presente no es un cambio', () => {
    const left = { status: 'PRESENTE' as const, leftAt: new Date() };
    expect(markBlockedByDeparture(left, 'FALTA_INJUSTIFICADA')).toBe(true);
    expect(markBlockedByDeparture(left, 'PRESENTE')).toBe(false);
    expect(markBlockedByDeparture({ status: 'PRESENTE', leftAt: null }, 'FALTA_INJUSTIFICADA')).toBe(false);
    expect(markBlockedByDeparture(null, 'PRESENTE')).toBe(false);
  });
});

describe('INCIDENT_TYPES', () => {
  it('son los tipos del supuesto S-27', () => {
    expect(INCIDENT_TYPES).toEqual(['ACCIDENTE', 'ENFERMEDAD', 'CONDUCTA', 'OTRA']);
  });
});
