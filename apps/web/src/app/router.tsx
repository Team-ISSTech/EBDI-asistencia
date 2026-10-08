import type { PermissionCode } from '@sirai/auth';
import type { ReactNode } from 'react';
import { createBrowserRouter, Navigate } from 'react-router';
import { RequirePermission } from '../features/auth/require-permission';
import { RequireSession } from '../features/auth/require-session';
import { LoginPage } from '../features/auth/pages/login-page';
import { SelectEstanciaPage } from '../features/auth/pages/select-estancia-page';
import { RollCallPage } from '../features/attendance/pages/roll-call-page';
import { ChildrenPage } from '../features/children/pages/children-page';
import { FollowUpsPage } from '../features/follow-ups/pages/follow-ups-page';
import { ReportsPage } from '../features/reports/pages/reports-page';
import { UsersPage } from '../features/administration/pages/users-page';
import { AuditPage } from '../features/audit/pages/audit-page';
import { ForbiddenPage } from './pages/forbidden-page';
import { HomePage } from './pages/home-page';
import { AppShell } from './shell/app-shell';

const guarded = (permission: PermissionCode, element: ReactNode) => (
  <RequirePermission permission={permission}>{element}</RequirePermission>
);

export const router = createBrowserRouter([
  { path: '/', element: <Navigate to="/app" replace /> },
  { path: '/iniciar-sesion', element: <LoginPage /> },
  {
    path: '/seleccionar-estancia',
    element: (
      <RequireSession>
        <SelectEstanciaPage />
      </RequireSession>
    ),
  },
  {
    path: '/app',
    element: (
      <RequireSession>
        <AppShell />
      </RequireSession>
    ),
    children: [
      { index: true, element: <HomePage /> },
      { path: 'pase-de-lista', element: guarded('ASISTENCIA_CONSULTAR', <RollCallPage />) },
      { path: 'infantes', element: guarded('ASISTENCIA_CONSULTAR', <ChildrenPage />) },
      { path: 'seguimientos', element: guarded('SEGUIMIENTO_CONSULTAR', <FollowUpsPage />) },
      { path: 'reportes', element: guarded('REPORTE_AGREGADO_CONSULTAR', <ReportsPage />) },
      { path: 'administracion/usuarios', element: guarded('USUARIO_ADMINISTRAR', <UsersPage />) },
      { path: 'auditoria', element: guarded('AUDITORIA_CONSULTAR', <AuditPage />) },
      { path: 'sin-permiso', element: <ForbiddenPage /> },
    ],
  },
  { path: '*', element: <Navigate to="/app" replace /> },
]);
