import type { CreateSystemRequest } from '@sirai/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createSystem, fetchSystems, revokeSystem } from './systems-api';

const KEY = ['administration', 'systems'] as const;

export function useSystems() {
  return useQuery({ queryKey: KEY, queryFn: fetchSystems });
}

/** El secreto de un sistema nuevo vive solo en el resultado de esta mutación: nunca en la caché de consultas. */
export function useSystemActions() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: KEY });
  return {
    create: useMutation({ mutationFn: (body: CreateSystemRequest) => createSystem(body), onSuccess: refresh }),
    revoke: useMutation({ mutationFn: (id: number) => revokeSystem(id), onSuccess: refresh }),
  };
}
