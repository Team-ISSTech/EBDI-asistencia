import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { AssignmentInput } from '@sirai/contracts';
import { AssignmentEditor } from '../features/administration/assignment-editor';
import { docenteSession, renderWithSession } from './test-utils';

const estancias = [
  { id: 1, name: 'Estancia 1' },
  { id: 2, name: 'Estancia 2' },
];

describe('AssignmentEditor', () => {
  it('agrega una fila con docente en la primera estancia', async () => {
    const onChange = vi.fn();
    renderWithSession(<AssignmentEditor value={[]} estancias={estancias} onChange={onChange} />, docenteSession);
    await userEvent.click(screen.getByRole('button', { name: 'Agregar rol' }));
    expect(onChange).toHaveBeenCalledWith([{ role: 'DOCENTE', estanciaId: 1 }]);
  });

  it('al elegir un rol central quita la estancia; al volver a uno de estancia la recupera', async () => {
    const onChange = vi.fn();
    const value: AssignmentInput[] = [{ role: 'DOCENTE', estanciaId: 2 }];
    renderWithSession(<AssignmentEditor value={value} estancias={estancias} onChange={onChange} />, docenteSession);
    await userEvent.selectOptions(screen.getByLabelText('Rol 1'), 'ADMIN_CENTRAL');
    expect(onChange).toHaveBeenLastCalledWith([{ role: 'ADMIN_CENTRAL', estanciaId: null }]);
  });

  it('cambia la estancia de un rol', async () => {
    const onChange = vi.fn();
    const value: AssignmentInput[] = [{ role: 'DOCENTE', estanciaId: 1 }];
    renderWithSession(<AssignmentEditor value={value} estancias={estancias} onChange={onChange} />, docenteSession);
    await userEvent.selectOptions(screen.getByLabelText('Estancia del rol 1'), '2');
    expect(onChange).toHaveBeenLastCalledWith([{ role: 'DOCENTE', estanciaId: 2 }]);
  });

  it('quita una fila', async () => {
    const onChange = vi.fn();
    const value: AssignmentInput[] = [
      { role: 'DOCENTE', estanciaId: 1 },
      { role: 'MEDICO', estanciaId: 2 },
    ];
    renderWithSession(<AssignmentEditor value={value} estancias={estancias} onChange={onChange} />, docenteSession);
    await userEvent.click(screen.getByRole('button', { name: 'Quitar rol 1' }));
    expect(onChange).toHaveBeenCalledWith([{ role: 'MEDICO', estanciaId: 2 }]);
  });
});
