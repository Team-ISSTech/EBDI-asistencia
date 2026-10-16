import { describe, expect, it } from 'vitest';
import { principalOf, type UserRecord } from '../identity.types';
import { docenteRecord } from './in-memory';

const withAssignments = (assignments: UserRecord['assignments']): UserRecord => ({ ...docenteRecord(), id: 5, assignments });

describe('principalOf', () => {
  it('lleva la región de un rol central hasta el principal (P9)', () => {
    const principal = principalOf(withAssignments([{ role: 'SUPERVISOR_CENTRAL', estanciaId: null, estanciaName: null, region: 'Norte' }]));
    expect(principal.assignments).toEqual([{ role: 'SUPERVISOR_CENTRAL', estanciaId: null, region: 'Norte' }]);
  });

  it('una asignación sin región queda sin región', () => {
    const principal = principalOf(withAssignments([{ role: 'DOCENTE', estanciaId: 1, estanciaName: 'Estancia 1' }]));
    expect(principal.assignments[0]).toMatchObject({ role: 'DOCENTE', estanciaId: 1, region: null });
  });
});
