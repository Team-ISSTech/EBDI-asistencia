import { describe, expect, it } from 'vitest';
import { AUDIT_ACTIONS, AUDIT_ACTION_MAX_LENGTH } from '../audit/audit.service';

describe('AUDIT_ACTIONS', () => {
  it('cada acción cabe en la columna `accion` de la bitácora (VARCHAR(30))', () => {
    expect(AUDIT_ACTION_MAX_LENGTH).toBe(30);
    const tooLong = AUDIT_ACTIONS.filter((action) => action.length > AUDIT_ACTION_MAX_LENGTH);
    expect(tooLong).toEqual([]);
  });

  it('no repite acciones', () => {
    expect(new Set(AUDIT_ACTIONS).size).toBe(AUDIT_ACTIONS.length);
  });
});
