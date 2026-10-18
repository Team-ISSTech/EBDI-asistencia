import type { AuditQuery } from '@sirai/contracts';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { fetchAudit, fetchAuditFilters } from './api';

export type AuditFilterValues = Partial<Omit<AuditQuery, 'beforeId' | 'limit'>>;

/** La bitácora crece mientras se mira: se pagina por cursor, no por número de página. */
export function useAuditEntries(filters: AuditFilterValues) {
  return useInfiniteQuery({
    queryKey: ['audit', 'entries', filters],
    queryFn: ({ pageParam }) => fetchAudit({ ...filters, ...(pageParam === undefined ? {} : { beforeId: pageParam }) }),
    initialPageParam: undefined as number | undefined,
    getNextPageParam: (last) => last.nextBeforeId ?? undefined,
  });
}

export function useAuditFilters() {
  return useQuery({ queryKey: ['audit', 'filters'], queryFn: fetchAuditFilters });
}
