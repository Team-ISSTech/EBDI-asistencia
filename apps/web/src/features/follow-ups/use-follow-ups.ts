import type { RegisterContactRequest, RegisterMedicalReleaseRequest } from '@sirai/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useOfflineOptional } from '../../offline/offline-api';
import { saveOrQueue } from '../../offline/save-or-queue';
import { withCache } from '../../offline/with-cache';
import { closeFollowUp, fetchContacts, fetchFollowUps, registerContact, registerRelease } from './api';

const FOLLOW_UPS_KEY = ['follow-ups'] as const;
const contactsKey = (followUpId: number) => ['follow-ups', followUpId, 'contacts'] as const;

/** La bandeja se guarda en la tablet al consultarla con conexión, para abrirla sin ella. */
export function useFollowUps() {
  const offline = useOfflineOptional();
  return useQuery({ queryKey: FOLLOW_UPS_KEY, queryFn: () => withCache(offline, 'follow-ups', fetchFollowUps) });
}

/** El historial trae notas descifradas: solo se pide si la sesión puede verlas. */
export function useContacts(followUpId: number, enabled: boolean) {
  return useQuery({ queryKey: contactsKey(followUpId), queryFn: () => fetchContacts(followUpId), enabled });
}

/**
 * Registrar un intento cambia el ticket (causa, candado, alerta) y el historial: se refrescan ambos.
 * Sin conexión, la llamada se guarda en la tablet con la hora en que se hizo y se envía sola
 * (RF-20 a RF-23): el resultado dice cuál de las dos cosas pasó.
 */
export function useRegisterContact(followUpId: number) {
  const client = useQueryClient();
  const offline = useOfflineOptional();
  return useMutation({
    mutationFn: (body: RegisterContactRequest) =>
      saveOrQueue(() => registerContact(followUpId, body), offline ? () => offline.enqueue({ type: 'FOLLOW_UP_CONTACT', payload: { followUpId, contact: body } }) : null),
    onSuccess: () => Promise.all([client.invalidateQueries({ queryKey: FOLLOW_UPS_KEY }), client.invalidateQueries({ queryKey: contactsKey(followUpId) })]),
  });
}

/** El alta libera el candado: la bandeja y, en el pase de lista, la lista del infante cambian. */
export function useRegisterRelease(followUpId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (body: RegisterMedicalReleaseRequest) => registerRelease(followUpId, body),
    onSuccess: () => Promise.all([client.invalidateQueries({ queryKey: FOLLOW_UPS_KEY }), client.invalidateQueries({ queryKey: ['attendance'] })]),
  });
}

/** Un caso cerrado sale de la bandeja. */
export function useCloseFollowUp(followUpId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: () => closeFollowUp(followUpId),
    onSuccess: () => client.invalidateQueries({ queryKey: FOLLOW_UPS_KEY }),
  });
}
