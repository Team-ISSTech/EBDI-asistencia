import type { CreateGuardianRequest, LinkGuardianRequest } from '@sirai/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createGuardian, fetchChildGuardians, fetchGuardianPhone, linkGuardian } from './api';

const guardiansKey = (childId: number) => ['children', childId, 'guardians'] as const;

export function useChildGuardians(childId: number) {
  return useQuery({ queryKey: guardiansKey(childId), queryFn: () => fetchChildGuardians(childId) });
}

export interface AddGuardianInput {
  readonly guardian: CreateGuardianRequest;
  readonly link: Omit<LinkGuardianRequest, 'guardianId'>;
}

/** Registra al tutor y lo vincula al infante; si el vínculo falla, el error llega al formulario. */
export function useAddGuardian(childId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ guardian, link }: AddGuardianInput) => {
      const created = await createGuardian(guardian);
      return linkGuardian(childId, { ...link, guardianId: created.id });
    },
    onSuccess: () => client.invalidateQueries({ queryKey: guardiansKey(childId) }),
  });
}

/** Mutación y no consulta: el teléfono no se guarda en caché ni se pide solo. */
export function useRevealPhone() {
  return useMutation({ mutationFn: (guardianId: number) => fetchGuardianPhone(guardianId) });
}
