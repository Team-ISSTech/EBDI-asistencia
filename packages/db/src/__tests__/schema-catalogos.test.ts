import { getTableColumns, getTableName } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { estancias, usuarioRol, usuarios } from '../schema/index.js';
import * as schema from '../schema/index.js';

describe('esquema Drizzle de la migración 0003', () => {
  it('expone ciclos_escolares con estado y rango de fechas', () => {
    expect(schema).toHaveProperty('ciclosEscolares');
    const columns = Object.keys(getTableColumns(schema.ciclosEscolares));
    expect(columns).toEqual(expect.arrayContaining(['code', 'startDate', 'endDate', 'status', 'archivedAt']));
  });

  it('atribuye el borrado lógico con deletedBy en estancias y usuarios', () => {
    expect(getTableColumns(estancias)).toHaveProperty('deletedBy');
    expect(getTableColumns(usuarios)).toHaveProperty('deletedBy');
  });

  it('da alcance por región al rol asignado', () => {
    expect(getTableColumns(usuarioRol)).toHaveProperty('region');
  });
});

describe('esquema Drizzle de los catálogos', () => {
  const tableNames: Record<string, string> = {
    rooms: 'salas_grupos',
    children: 'infantes',
    guardians: 'tutores',
    childGuardians: 'infante_tutor',
    enrollments: 'inscripciones',
    enrollmentMovements: 'movimientos_inscripcion',
    consents: 'consentimientos',
  };

  it.each(Object.entries(tableNames))('mapea %s a la tabla %s', (key, name) => {
    const table = (schema as unknown as Record<string, Parameters<typeof getTableName>[0]>)[key];
    expect(table, `falta ${key}`).toBeDefined();
    expect(getTableName(table!)).toBe(name);
  });

  it('guarda los datos sensibles solo en columnas cifradas', () => {
    expect(getTableColumns(schema.children)).toHaveProperty('disabilityGroupEncrypted');
    expect(getTableColumns(schema.guardians)).toHaveProperty('phoneEncrypted');
    expect(getTableColumns(schema.guardians)).toHaveProperty('phoneHash');
    expect(getTableColumns(schema.children)).not.toHaveProperty('disabilityGroup');
  });

  it('todo catálogo con borrado lógico registra quién borró', () => {
    for (const table of [schema.rooms, schema.children, schema.guardians, schema.enrollments]) {
      expect(getTableColumns(table)).toHaveProperty('deletedAt');
      expect(getTableColumns(table)).toHaveProperty('deletedBy');
    }
  });
});
