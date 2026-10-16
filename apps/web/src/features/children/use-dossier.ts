import type { VerifyDossierRequest } from '@sirai/contracts';
import { useMutation } from '@tanstack/react-query';
import { saveDownload } from '../../lib/download';
import { downloadDossier, verifyDossier } from './api';

/** Cada descarga emite un expediente nuevo con su folio: no se guarda en caché. */
export function useDownloadDossier() {
  return useMutation({ mutationFn: (childId: number) => downloadDossier(childId), onSuccess: saveDownload });
}

export function useVerifyDossier() {
  return useMutation({ mutationFn: (body: VerifyDossierRequest) => verifyDossier(body) });
}
