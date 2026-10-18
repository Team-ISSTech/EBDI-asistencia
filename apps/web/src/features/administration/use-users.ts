import type { CreateUserRequest, ReplaceRolesRequest, ResetPasswordRequest } from '@sirai/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createUser, fetchUsers, replaceRoles, resetPassword } from './api';

const USERS_KEY = ['users'] as const;

export function useUsers() {
  return useQuery({ queryKey: USERS_KEY, queryFn: fetchUsers });
}

export function useUserActions() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: USERS_KEY });
  return {
    create: useMutation({ mutationFn: (body: CreateUserRequest) => createUser(body), onSuccess: refresh }),
    replaceRoles: useMutation({
      mutationFn: ({ userId, body }: { userId: number; body: ReplaceRolesRequest }) => replaceRoles(userId, body),
      onSuccess: refresh,
    }),
  };
}

/** Restablecer no cambia la lista de usuarios: no hay nada que volver a pedir. */
export function useResetPassword() {
  return useMutation({ mutationFn: ({ userId, body }: { userId: number; body: ResetPasswordRequest }) => resetPassword(userId, body) });
}
