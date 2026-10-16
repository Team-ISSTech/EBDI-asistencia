import { useQuery } from '@tanstack/react-query';
import { fetchDashboard } from './api';

const REFRESH_MS = 30_000;

/** RF-16 "tiempo real": el tablero se vuelve a pedir cada 30 segundos mientras la pantalla está abierta. */
export function useDashboard(date: string) {
  return useQuery({ queryKey: ['reports', 'dashboard', date], queryFn: () => fetchDashboard(date), refetchInterval: REFRESH_MS });
}
