import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { UsersTable } from '../features/administration/users-table';
import { docenteSession, renderWithSession } from './test-utils';

describe('UsersTable', () => {
  it('distingue roles globales, usuarios sin roles, inactivos y último acceso', async () => {
    const onEdit = vi.fn();
    const users = [
      { id: 1, name: 'Admin', email: 'a@sirai.test', status: 'ACTIVO' as const, assignments: [{ role: 'ADMIN_CENTRAL' as const, estanciaId: null }], lastAccessAt: '2026-10-07T08:00:00.000Z' },
      { id: 2, name: 'Baja', email: 'b@sirai.test', status: 'INACTIVO' as const, assignments: [], lastAccessAt: null },
    ];
    renderWithSession(<UsersTable users={users} estancias={[]} onEdit={onEdit} onResetPassword={vi.fn()} onRetire={vi.fn()} currentUserId={0} />, docenteSession);
    expect(screen.getByText('Administrador central')).toBeInTheDocument();
    expect(screen.getByText('Sin roles')).toBeInTheDocument();
    expect(screen.getByText('Inactivo')).toBeInTheDocument();
    expect(screen.getByText('Nunca')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: 'Editar roles' })[1]!);
    expect(onEdit).toHaveBeenCalledWith(users[1]);
  });
});
