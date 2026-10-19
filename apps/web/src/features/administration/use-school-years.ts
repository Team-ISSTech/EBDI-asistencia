import type { OpenSchoolYearRequest, PurgeSchoolYearRequest } from '@sirai/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchSchoolYears, openSchoolYear, purgeSchoolYear } from './school-years-api';

const KEY = ['administration', 'school-years'] as const;

export function useSchoolYears() {
  return useQuery({ queryKey: KEY, queryFn: fetchSchoolYears });
}

export function useSchoolYearActions() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: KEY });
  return {
    open: useMutation({ mutationFn: (body: OpenSchoolYearRequest) => openSchoolYear(body), onSuccess: refresh }),
    purge: useMutation({ mutationFn: ({ id, body }: { id: number; body: PurgeSchoolYearRequest }) => purgeSchoolYear(id, body), onSuccess: refresh }),
  };
}
