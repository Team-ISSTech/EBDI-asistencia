import type { CreateEstanciaRequest, UpdateEstanciaRequest } from '@sirai/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createEstancia, fetchEstancias, retireEstancia, updateEstancia } from './estancias-api';

const KEY = ['administration', 'estancias'] as const;

export function useEstancias() {
  return useQuery({ queryKey: KEY, queryFn: fetchEstancias });
}

/** Cualquier cambio del catálogo vuelve a pedir la lista. */
export function useEstanciaActions() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: KEY });
  return {
    create: useMutation({ mutationFn: (body: CreateEstanciaRequest) => createEstancia(body), onSuccess: refresh }),
    update: useMutation({ mutationFn: ({ id, body }: { id: number; body: UpdateEstanciaRequest }) => updateEstancia(id, body), onSuccess: refresh }),
    retire: useMutation({ mutationFn: (id: number) => retireEstancia(id), onSuccess: refresh }),
  };
}
