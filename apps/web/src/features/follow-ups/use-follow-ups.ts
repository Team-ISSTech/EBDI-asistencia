import type { RegisterContactRequest } from '@sirai/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchContacts, fetchFollowUps, registerContact } from './api';

const FOLLOW_UPS_KEY = ['follow-ups'] as const;
const contactsKey = (followUpId: number) => ['follow-ups', followUpId, 'contacts'] as const;

export function useFollowUps() {
  return useQuery({ queryKey: FOLLOW_UPS_KEY, queryFn: fetchFollowUps });
}

/** El historial trae notas descifradas: solo se pide si la sesión puede verlas. */
export function useContacts(followUpId: number, enabled: boolean) {
  return useQuery({ queryKey: contactsKey(followUpId), queryFn: () => fetchContacts(followUpId), enabled });
}

/** Registrar un intento cambia el ticket (causa, candado, alerta) y el historial: se refrescan ambos. */
export function useRegisterContact(followUpId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: RegisterContactRequest) => registerContact(followUpId, body),
    onSuccess: () => Promise.all([client.invalidateQueries({ queryKey: FOLLOW_UPS_KEY }), client.invalidateQueries({ queryKey: contactsKey(followUpId) })]),
  });
}
