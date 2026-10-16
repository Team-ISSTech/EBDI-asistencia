import {
  type Child,
  type ChildGuardian,
  type ChildGuardianListResponse,
  type ChildListResponse,
  type Consent,
  type ConsentListResponse,
  type CreateGuardianRequest,
  childGuardianListResponseSchema,
  childGuardianSchema,
  childListResponseSchema,
  childSchema,
  consentListResponseSchema,
  consentSchema,
  type EnrollChildRequest,
  type Guardian,
  type GuardianPhoneResponse,
  guardianPhoneResponseSchema,
  guardianSchema,
  type LinkGuardianRequest,
  type RegisterConsentRequest,
  type RoomListResponse,
  roomListResponseSchema,
  type VerifyDossierRequest,
  type VerifyDossierResponse,
  verifyDossierResponseSchema,
} from '@sirai/contracts';
import { apiDownload, apiRequest, type DownloadedFile } from '../../lib/api-client';

export const fetchChildren = (): Promise<ChildListResponse> => apiRequest('/infantes', { schema: childListResponseSchema });

export const fetchRooms = (): Promise<RoomListResponse> => apiRequest('/salas', { schema: roomListResponseSchema });

export const enrollChild = (body: EnrollChildRequest): Promise<Child> =>
  apiRequest('/infantes', { method: 'POST', body, schema: childSchema });

export const fetchChildGuardians = (childId: number): Promise<ChildGuardianListResponse> =>
  apiRequest(`/infantes/${childId}/tutores`, { schema: childGuardianListResponseSchema });

export const createGuardian = (body: CreateGuardianRequest): Promise<Guardian> =>
  apiRequest('/tutores', { method: 'POST', body, schema: guardianSchema });

export const linkGuardian = (childId: number, body: LinkGuardianRequest): Promise<ChildGuardian> =>
  apiRequest(`/infantes/${childId}/tutores`, { method: 'POST', body, schema: childGuardianSchema });

export const fetchGuardianPhone = (guardianId: number): Promise<GuardianPhoneResponse> =>
  apiRequest(`/tutores/${guardianId}/telefono`, { schema: guardianPhoneResponseSchema });

export const fetchConsents = (childId: number): Promise<ConsentListResponse> =>
  apiRequest(`/infantes/${childId}/consentimientos`, { schema: consentListResponseSchema });

export const registerConsent = (childId: number, body: RegisterConsentRequest): Promise<Consent> =>
  apiRequest(`/infantes/${childId}/consentimientos`, { method: 'POST', body, schema: consentSchema });

export const revokeConsent = (consentId: number): Promise<Consent> =>
  apiRequest(`/consentimientos/${consentId}/revocar`, { method: 'POST', schema: consentSchema });

/** Expediente del infante en PDF, foliado y sellado (RF-19). */
export const downloadDossier = (childId: number): Promise<DownloadedFile> => apiDownload(`/expedientes/${childId}`, `expediente-${childId}.pdf`);

export const verifyDossier = (body: VerifyDossierRequest): Promise<VerifyDossierResponse> =>
  apiRequest('/expedientes/verificar', { method: 'POST', body, schema: verifyDossierResponseSchema });
