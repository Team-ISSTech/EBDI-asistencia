import type { RegisterConsentRequest } from '@sirai/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchConsents, registerConsent, revokeConsent } from './api';

const consentsKey = (childId: number) => ['children', childId, 'consents'] as const;

export function useChildConsents(childId: number) {
  return useQuery({ queryKey: consentsKey(childId), queryFn: () => fetchConsents(childId) });
}

/** Registrar y revocar comparten el refresco del historial del infante. */
export function useConsentActions(childId: number) {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: consentsKey(childId) });
  return {
    register: useMutation({ mutationFn: (body: RegisterConsentRequest) => registerConsent(childId, body), onSuccess: refresh }),
    revoke: useMutation({ mutationFn: (consentId: number) => revokeConsent(consentId), onSuccess: refresh }),
  };
}
