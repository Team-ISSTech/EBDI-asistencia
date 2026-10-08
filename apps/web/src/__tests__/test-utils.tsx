import type { SessionResponse } from '@sirai/contracts';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { SESSION_QUERY_KEY } from '../features/auth/use-session';

export const docenteSession: SessionResponse = {
  user: { id: 1, name: 'Docente Prueba', email: 'docente@sirai.test' },
  assignments: [{ role: 'DOCENTE', estanciaId: 1, estanciaName: 'Estancia de prueba 01' }],
  activeEstancia: { id: 1, name: 'Estancia de prueba 01' },
  availableEstancias: [{ id: 1, name: 'Estancia de prueba 01' }],
  permissions: ['ASISTENCIA_CONSULTAR', 'ASISTENCIA_REGISTRAR'],
};

/**
 * Renderiza con una sesión ya en caché, como la dejaría `/auth/me`.
 * `session === undefined` deja la caché vacía para que la consulta se ejecute.
 */
interface RenderOptions {
  /** Elemento para la ruta de inicio de sesión; por defecto un texto fijo. */
  readonly loginElement?: ReactNode;
  /** Cliente de consultas a usar (por ejemplo el de producción) en vez de uno nuevo. */
  readonly client?: QueryClient;
}

export function renderWithSession(
  ui: ReactNode,
  session: SessionResponse | null | undefined,
  path = '/',
  onClient?: (client: QueryClient) => void,
  options: RenderOptions = {},
) {
  const client = options.client ?? new QueryClient({ defaultOptions: { queries: { retry: false } } });
  if (session !== undefined) client.setQueryData(SESSION_QUERY_KEY, session);
  onClient?.(client);
  const result = render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path={path} element={ui} />
          <Route path="/app" element={<p>Pantalla de la app</p>} />
          <Route path="/app/pase-de-lista" element={<p>Pantalla pase de lista</p>} />
          <Route path="/app/sin-permiso" element={<p>Pantalla sin permiso</p>} />
          <Route path="/iniciar-sesion" element={options.loginElement ?? <p>Pantalla de inicio de sesión</p>} />
          <Route path="/seleccionar-estancia" element={<p>Pantalla de selección de estancia</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return { ...result, client };
}
