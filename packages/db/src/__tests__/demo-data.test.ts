import { describe, expect, it } from 'vitest';
import { ageInMonths } from '@sirai/domain';
import { DEMO_ROOM_PLANS, createRng, followUpScenario, planEstancia, schoolDaysBefore } from '../seed/demo-data.js';

const TODAY = '2026-10-20';

describe('createRng', () => {
  it('con la misma semilla produce la misma secuencia', () => {
    const a = createRng(7);
    const b = createRng(7);
    expect([a.next(), a.next(), a.next()]).toEqual([b.next(), b.next(), b.next()]);
  });

  it('int respeta los límites incluyentes', () => {
    const rng = createRng(1);
    const values = Array.from({ length: 200 }, () => rng.int(3, 5));
    expect(Math.min(...values)).toBe(3);
    expect(Math.max(...values)).toBe(5);
  });
});

describe('schoolDaysBefore', () => {
  it('devuelve días hábiles anteriores a hoy, del más reciente al más antiguo', () => {
    // 2026-10-20 es martes: lunes 19, viernes 16, jueves 15...
    expect(schoolDaysBefore(TODAY, 4, '2026-08-24')).toEqual(['2026-10-19', '2026-10-16', '2026-10-15', '2026-10-14']);
  });

  it('no baja de la fecha de inicio del ciclo', () => {
    expect(schoolDaysBefore('2026-08-26', 10, '2026-08-24')).toEqual(['2026-08-25', '2026-08-24']);
  });
});

describe('planEstancia', () => {
  const plan = planEstancia(0, TODAY, createRng(2026));

  it('es determinista', () => {
    expect(planEstancia(0, TODAY, createRng(2026))).toEqual(plan);
  });

  it('llena cada sala con los infantes de su plan', () => {
    for (const [index, room] of DEMO_ROOM_PLANS.entries()) {
      expect(plan.children.filter((child) => child.roomIndex === index)).toHaveLength(room.children);
    }
  });

  it('respeta capacidad y rango de edad de cada sala a la fecha de hoy', () => {
    for (const child of plan.children) {
      const { room } = DEMO_ROOM_PLANS[child.roomIndex]!;
      const months = ageInMonths(child.birthDate, `${TODAY}T12:00:00.000Z`);
      expect(months).toBeGreaterThanOrEqual(room.minAgeMonths);
      expect(months).toBeLessThanOrEqual(room.maxAgeMonths);
    }
    for (const [index, { room, children }] of DEMO_ROOM_PLANS.entries()) {
      expect(children, `sala ${index}`).toBeLessThanOrEqual(room.capacity);
    }
  });

  it('matrículas únicas con el prefijo DEMO y sin CURP inventada', () => {
    const numbers = plan.children.map((child) => child.enrollmentNumber);
    expect(new Set(numbers).size).toBe(numbers.length);
    expect(numbers.every((number) => /^DEMO-01-\d{3}$/.test(number))).toBe(true);
  });

  it('teléfonos de 10 dígitos, únicos entre estancias y fuera de rangos asignables', () => {
    const other = planEstancia(1, TODAY, createRng(2026));
    const phones = [...plan.families, ...other.families].flatMap((family) => family.guardians.map((g) => g.phone)).filter((phone): phone is string => phone !== null);
    expect(new Set(phones).size).toBe(phones.length);
    expect(phones.every((phone) => /^5500\d{6}$/.test(phone))).toBe(true);
  });

  it('cada infante tiene una familia con exactamente un tutor principal que puede recoger y hay contacto de emergencia', () => {
    for (const child of plan.children) {
      const family = plan.families.find((candidate) => candidate.key === child.familyKey);
      expect(family, child.enrollmentNumber).toBeDefined();
      expect(family!.guardians.filter((guardian) => guardian.isPrimary)).toHaveLength(1);
      expect(family!.guardians.find((guardian) => guardian.isPrimary)?.canPickUp).toBe(true);
      expect(family!.guardians.some((guardian) => guardian.isEmergencyContact)).toBe(true);
    }
  });

  it('incluye hermanos que comparten tutor, un tutor sin teléfono y todos los perfiles de consentimiento', () => {
    const familyCounts = plan.children.reduce<Record<string, number>>((acc, child) => ({ ...acc, [child.familyKey]: (acc[child.familyKey] ?? 0) + 1 }), {});
    expect(Object.values(familyCounts).some((count) => count > 1)).toBe(true);
    expect(plan.families.some((family) => family.guardians.some((guardian) => guardian.phone === null))).toBe(true);
    expect(new Set(plan.children.map((child) => child.consent))).toEqual(new Set(['COMPLETO', 'SOLO_DATOS', 'PENDIENTE', 'RECHAZADO', 'REVOCADO']));
  });

  it('la discapacidad y su grupo van juntas', () => {
    expect(plan.children.some((child) => child.disabilityGroup !== null)).toBe(true);
  });
});

describe('followUpScenario', () => {
  const RECENT = 2;
  const at = new Date('2026-10-14T15:00:00Z');

  it('los tickets de los días más recientes quedan abiertos, sin contactos, para que alguien los trabaje', () => {
    const scenario = followUpScenario(0, 0, RECENT, at);
    expect(scenario).toMatchObject({ status: 'ABIERTO', cause: null, contacts: [], release: false });
  });

  it('un caso médico clasificado queda con el candado activo (requiere alta y no la tiene)', () => {
    const scenarios = Array.from({ length: 7 }, (_, index) => followUpScenario(index, RECENT, RECENT, at));
    const locked = scenarios.find((scenario) => scenario.requiresMedicalRelease && scenario.status !== 'CERRADO');
    expect(locked).toMatchObject({ status: 'CLASIFICADO', cause: 'ENF_CASA', release: false });
    expect(locked?.expectedReturnDate).not.toBeNull();
  });

  it('cubre la alerta de emergencia: NO_LOC con dos intentos fallidos separados al menos 4 horas', () => {
    const scenarios = Array.from({ length: 7 }, (_, index) => followUpScenario(index, RECENT, RECENT, at));
    const alert = scenarios.find((scenario) => scenario.contacts.length === 2);
    expect(alert).toMatchObject({ status: 'CLASIFICADO', cause: 'NO_LOC' });
    const [first, second] = alert!.contacts;
    expect(second!.occurredAt.getTime() - first!.occurredAt.getTime()).toBeGreaterThanOrEqual(4 * 3_600_000);
    expect(alert!.contacts.every((contact) => contact.result === 'SIN_RESPUESTA')).toBe(true);
  });

  it('los casos cerrados que requerían alta médica la traen, y todos tienen fecha de cierre', () => {
    const closed = Array.from({ length: 7 }, (_, index) => followUpScenario(index, RECENT, RECENT, at)).filter((scenario) => scenario.status === 'CERRADO');
    expect(closed.length).toBeGreaterThan(0);
    for (const scenario of closed) {
      expect(scenario.closedAt).not.toBeNull();
      expect(scenario.release).toBe(scenario.requiresMedicalRelease);
    }
  });
});
