import { type DashboardResponse, dashboardResponseSchema } from '@sirai/contracts';
import { apiRequest } from '../../lib/api-client';

export const fetchDashboard = (date: string): Promise<DashboardResponse> => apiRequest(`/reportes/tablero?date=${date}`, { schema: dashboardResponseSchema });
