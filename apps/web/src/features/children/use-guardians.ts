import type { CreateGuardianRequest, LinkGuardianRequest, UpdateGuardianLinkRequest, UpdateGuardianRequest } from '@sirai/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useOfflineOptional } from '../../offline/offline-api';
import { withCache } from '../../offline/with-cache';
import { createGuardian, fetchChildGuardians, fetchGuardianPhone, linkGuardian, unlinkGuardian, updateGuardian, updateGuardianLink } from './api';

const guardiansKey = (childId: number) => ['children', childId, 'guardians'] as const;

/** Los tutores (sin teléfonos) se guardan al abrirlos con conexión: hacen falta para registrar una llamada sin ella. */
export function useChildGuardians(childId: number) {
  const offline = useOfflineOptional();
  return useQuery({ queryKey: guardiansKey(childId), queryFn: () => withCache(offline, `guardians:${childId}`, () => fetchChildGuardians(childId)) });
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

export interface EditGuardianInput {
  readonly guardianId: number;
  readonly guardian: UpdateGuardianRequest;
  readonly link: UpdateGuardianLinkRequest;
}

/** Guarda al tutor y luego su vínculo; si el segundo paso falla, reintentar repite el primero sin efecto. */
export function useEditGuardian(childId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ guardianId, guardian, link }: EditGuardianInput) => {
      await updateGuardian(guardianId, guardian);
      return updateGuardianLink(childId, guardianId, link);
    },
    onSuccess: () => client.invalidateQueries({ queryKey: guardiansKey(childId) }),
  });
}

export function useUnlinkGuardian(childId: number) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ guardianId, retireGuardian }: { guardianId: number; retireGuardian: boolean }) => unlinkGuardian(childId, guardianId, retireGuardian),
    onSuccess: () => client.invalidateQueries({ queryKey: guardiansKey(childId) }),
  });
}
