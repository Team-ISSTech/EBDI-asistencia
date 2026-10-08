import { screen } from '@testing-library/react';
import { useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import { RequirePermission } from '../features/auth/require-permission';
import { RequireSession } from '../features/auth/require-session';
import { Sidebar } from '../app/shell/sidebar';
import { docenteSession, renderWithSession } from './test-utils';

describe('RequirePermission', () => {
  it('muestra el contenido cuando la sesión tiene el permiso', () => {
    renderWithSession(
      <RequirePermission permission="ASISTENCIA_CONSULTAR">
        <p>Contenido protegido</p>
      </RequirePermission>,
      docenteSession,
    );
    expect(screen.getByText('Contenido protegido')).toBeInTheDocument();
  });

  it('redirige a sin permiso cuando falta el permiso', () => {
    renderWithSession(
      <RequirePermission permission="USUARIO_ADMINISTRAR">
        <p>Contenido protegido</p>
      </RequirePermission>,
      docenteSession,
    );
    expect(screen.getByText('Pantalla sin permiso')).toBeInTheDocument();
    expect(screen.queryByText('Contenido protegido')).toBeNull();
  });
});

function LoginProbe() {
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;
  return <p>Pantalla de inicio de sesión desde {from ?? 'ninguna parte'}</p>;
}

describe('RequireSession', () => {
  it('redirige a iniciar sesión recordando la ruta original en state.from', () => {
    renderWithSession(
      <RequireSession>
        <p>Dentro</p>
      </RequireSession>,
      null,
      '/app/auditoria',
      undefined,
      { loginElement: <LoginProbe /> },
    );
    expect(screen.getByText('Pantalla de inicio de sesión desde /app/auditoria')).toBeInTheDocument();
    expect(screen.queryByText('Dentro')).toBeNull();
  });
});

describe('Sidebar', () => {
  it('solo enlaza a las secciones permitidas', () => {
    renderWithSession(<Sidebar permissions={docenteSession.permissions} />, docenteSession);
    expect(screen.getByRole('link', { name: 'Pase de lista' })).toHaveAttribute('href', '/app/pase-de-lista');
    expect(screen.queryByRole('link', { name: 'Usuarios' })).toBeNull();
  });
});
