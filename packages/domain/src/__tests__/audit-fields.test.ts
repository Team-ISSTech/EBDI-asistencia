import { describe, expect, it } from 'vitest';
import { changedFieldNames } from '../audit-fields.js';

describe('changedFieldNames (RF-11)', () => {
  it('une los nombres de campo de antes y después, sin repetir y ordenados', () => {
    expect(changedFieldNames({ timeZone: 'America/Tijuana', name: 'A' }, { name: 'B', region: 'Norte' })).toEqual(['name', 'region', 'timeZone']);
  });

  it('nunca devuelve valores, solo nombres', () => {
    const names = changedFieldNames({ phone: '5512345678' }, { email: 'tutor@ejemplo.test', disabilityGroup: 'Motriz' });
    expect(names).toEqual(['disabilityGroup', 'email', 'phone']);
    expect(JSON.stringify(names)).not.toMatch(/5512345678|ejemplo|Motriz/);
  });

  it('cuando el cambio trae `fields`, esos son los nombres (no la palabra "fields")', () => {
    expect(changedFieldNames(null, { fields: ['name', 'birthDate'] })).toEqual(['birthDate', 'name']);
  });

  it('ignora lo que no es un objeto: nulo, texto, números, listas', () => {
    expect(changedFieldNames(null, null)).toEqual([]);
    expect(changedFieldNames('texto', 42)).toEqual([]);
    expect(changedFieldNames([1, 2], undefined)).toEqual([]);
  });

  it('descarta nombres que no parecen identificadores, para que un valor mal colocado nunca salga', () => {
    expect(changedFieldNames(null, { fields: ['name', 'Ana Pérez López', 'a@b.test', '5512345678', ''] })).toEqual(['name']);
    expect(changedFieldNames({ 'Ana Pérez': 1, ok_field: 2 }, null)).toEqual(['ok_field']);
  });

  it('en un `fields` ignora lo que no sea texto', () => {
    expect(changedFieldNames(null, { fields: ['name', 3, null, { x: 1 }] })).toEqual(['name']);
  });
});
