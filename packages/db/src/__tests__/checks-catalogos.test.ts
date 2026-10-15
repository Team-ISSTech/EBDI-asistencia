import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  CHILD_STATUSES,
  ENROLLMENT_MOVEMENTS,
  ENROLLMENT_STATUSES,
  ESTANCIA_STATUSES,
  GUARDIAN_STATUSES,
  ROOM_STATUSES,
  SHIFTS,
} from '@sirai/domain';
import { describe, expect, it } from 'vitest';

const MIGRATION = resolve(import.meta.dirname, '../../sql/0004_checks_catalogos.sql');

/** Lista `IN (...)` del CHECK con el nombre dado. */
const checkValues = (sqlText: string, constraint: string): string[] => {
  const match = new RegExp(`CONSTRAINT ${constraint} CHECK \\(\\w+ IN \\(([^)]*)\\)\\)`).exec(sqlText);
  if (!match?.[1]) throw new Error(`No existe el CHECK ${constraint}`);
  return [...match[1].matchAll(/'([A-Z_]+)'/g)].map((m) => String(m[1]));
};

describe('CHECK de catálogos (migración 0004)', () => {
  const sqlText = readFileSync(MIGRATION, 'utf8');

  it.each([
    ['ck_estancias_estatus', ESTANCIA_STATUSES],
    ['ck_salas_estatus', ROOM_STATUSES],
    ['ck_salas_turno', SHIFTS],
    ['ck_infantes_estatus', CHILD_STATUSES],
    ['ck_tutores_estatus', GUARDIAN_STATUSES],
    ['ck_inscripciones_estatus', ENROLLMENT_STATUSES],
    ['ck_movimientos_tipo', ENROLLMENT_MOVEMENTS],
  ])('%s replica exactamente los valores de packages/domain', (constraint, values) => {
    expect(checkValues(sqlText, constraint)).toEqual([...values]);
  });
});
