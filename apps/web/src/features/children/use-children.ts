import type { EnrollChildRequest, UpdateChildRequest } from '@sirai/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { deleteChild, enrollChild, fetchChildren, fetchRooms, updateChild } from './api';

const CHILDREN_KEY = ['children'] as const;
const ROOMS_KEY = ['rooms'] as const;

export function useChildren() {
  return useQuery({ queryKey: CHILDREN_KEY, queryFn: fetchChildren });
}

/** Las salas solo se piden cuando el formulario de alta está abierto. */
export function useRooms(enabled: boolean) {
  return useQuery({ queryKey: ROOMS_KEY, queryFn: fetchRooms, enabled });
}

export function useEnrollChild() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: EnrollChildRequest) => enrollChild(body),
    onSuccess: () => client.invalidateQueries({ queryKey: CHILDREN_KEY }),
  });
}

export function useUpdateChild() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: UpdateChildRequest }) => updateChild(id, body),
    onSuccess: () => client.invalidateQueries({ queryKey: CHILDREN_KEY }),
  });
}

export function useDeleteChild() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteChild(id),
    onSuccess: () => client.invalidateQueries({ queryKey: CHILDREN_KEY }),
  });
}
