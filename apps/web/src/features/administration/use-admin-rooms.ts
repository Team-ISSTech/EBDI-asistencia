import type { CreateRoomRequest, UpdateRoomRequest } from '@sirai/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createRoom, fetchAdminRooms, retireRoom, updateRoom } from './rooms-api';

const KEY = ['administration', 'rooms'] as const;

export function useAdminRooms() {
  return useQuery({ queryKey: KEY, queryFn: fetchAdminRooms });
}

/** Cualquier cambio del catálogo vuelve a pedir la lista; también refresca las salas que usa el alta de infantes. */
export function useRoomActions() {
  const client = useQueryClient();
  const refresh = () => Promise.all([client.invalidateQueries({ queryKey: KEY }), client.invalidateQueries({ queryKey: ['rooms'] })]);
  return {
    create: useMutation({ mutationFn: (body: CreateRoomRequest) => createRoom(body), onSuccess: refresh }),
    update: useMutation({ mutationFn: ({ id, body }: { id: number; body: UpdateRoomRequest }) => updateRoom(id, body), onSuccess: refresh }),
    retire: useMutation({ mutationFn: (id: number) => retireRoom(id), onSuccess: refresh }),
  };
}
