import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  ATTENDANCE_METHODS,
  ATTENDANCE_STATUSES,
  CHILD_STATUSES,
  CONSENT_TYPES,
  CONTACT_RESULTS,
  FOLLOW_UP_CAUSES,
  FOLLOW_UP_STATUSES,
  EMERGENCY_NOTICE_STATUSES,
  ENROLLMENT_MOVEMENTS,
  ENROLLMENT_STATUSES,
  ESTANCIA_STATUSES,
  GUARDIAN_STATUSES,
  JOURNEY_STATUSES,
  ROOM_STATUSES,
  SHIFTS,
} from '@sirai/domain';
import { describe, expect, it } from 'vitest';

const MIGRATION = resolve(import.meta.dirname, '../../sql/0004_checks_catalogos.sql');
const ATTENDANCE_MIGRATION = resolve(import.meta.dirname, '../../sql/0007_checks_asistencia.sql');
const FOLLOW_UP_MIGRATION = resolve(import.meta.dirname, '../../sql/0008_checks_seguimientos.sql');
const CONTACT_MIGRATION = resolve(import.meta.dirname, '../../sql/0009_checks_contactos.sql');
const NOTICE_MIGRATION = resolve(import.meta.dirname, '../../sql/0017_avisos_emergencia.sql');
const CONSENT_MIGRATION = resolve(import.meta.dirname, '../../sql/0006_checks_consentimientos.sql');

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

describe('CHECK de consentimientos (migración 0006)', () => {
  const sqlText = readFileSync(CONSENT_MIGRATION, 'utf8');

  it('ck_consentimientos_tipo replica los tipos de packages/domain', () => {
    expect(checkValues(sqlText, 'ck_consentimientos_tipo')).toEqual([...CONSENT_TYPES]);
  });

  it('solo una aceptación puede estar revocada', () => {
    expect(sqlText).toMatch(/ck_consentimientos_revocacion CHECK \(revocado_at IS NULL OR aceptado = 1\)/);
  });
});

describe('CHECK de asistencia (migración 0007)', () => {
  const sqlText = readFileSync(ATTENDANCE_MIGRATION, 'utf8');

  it.each([
    ['ck_jornadas_estado', JOURNEY_STATUSES],
    ['ck_jornadas_turno', SHIFTS],
    ['ck_asistencias_estado', ATTENDANCE_STATUSES],
    ['ck_asistencias_metodo', ATTENDANCE_METHODS],
  ])('%s replica exactamente los valores de packages/domain', (constraint, values) => {
    expect(checkValues(sqlText, constraint)).toEqual([...values]);
  });
});

describe('CHECK de seguimientos (migración 0008)', () => {
  const sqlText = readFileSync(FOLLOW_UP_MIGRATION, 'utf8');

  it.each([
    ['ck_seguimientos_estado', FOLLOW_UP_STATUSES],
    ['ck_seguimientos_clasificacion', FOLLOW_UP_CAUSES],
  ])('%s replica exactamente los valores de packages/domain', (constraint, values) => {
    expect(checkValues(sqlText, constraint)).toEqual([...values]);
  });

  it('solo un ticket cerrado tiene fecha de cierre', () => {
    expect(sqlText).toMatch(/ck_seguimientos_cierre CHECK \(\(estado = 'CERRADO'\) = \(cerrado_at IS NOT NULL\)\)/);
  });
});

describe('CHECK de contactos de seguimiento (migración 0009)', () => {
  const sqlText = readFileSync(CONTACT_MIGRATION, 'utf8');

  it('ck_contactos_resultado replica los resultados de packages/domain', () => {
    expect(checkValues(sqlText, 'ck_contactos_resultado')).toEqual([...CONTACT_RESULTS]);
  });

  it('el canal es el teléfono, que exige el SRS (RF-25)', () => {
    expect(checkValues(sqlText, 'ck_contactos_canal')).toEqual(['TELEFONO']);
  });
});

describe('CHECK de avisos de emergencia (migración 0017)', () => {
  const sqlText = readFileSync(NOTICE_MIGRATION, 'utf8');

  it('ck_avisos_estado replica los estados de packages/domain', () => {
    expect(checkValues(sqlText, 'ck_avisos_estado')).toEqual([...EMERGENCY_NOTICE_STATUSES]);
  });

  it('un contacto recibe un solo aviso por seguimiento', () => {
    expect(sqlText).toMatch(/UNIQUE KEY uq_avisos_seguimiento_tutor \(seguimiento_id, tutor_id\)/);
  });
});
