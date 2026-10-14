import { getTableColumns } from 'drizzle-orm';
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
