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
  type EnrollmentMovementRequest,
  type Guardian,
  type GuardianPhoneResponse,
  guardianPhoneResponseSchema,
  guardianSchema,
  type LinkGuardianRequest,
  type PendingTransferListResponse,
  pendingTransferListResponseSchema,
  type ReceiveTransferRequest,
  type RegisterConsentRequest,
  type RoomListResponse,
  type TransferDestinationListResponse,
  transferDestinationListResponseSchema,
  roomListResponseSchema,
  type UpdateChildRequest,
  type UpdateGuardianLinkRequest,
  type UpdateGuardianRequest,
  type VerifyDossierRequest,
  type VerifyDossierResponse,
  verifyDossierResponseSchema,
} from '@sirai/contracts';
import { apiDownload, apiRequest, type DownloadedFile } from '../../lib/api-client';

export const fetchChildren = (): Promise<ChildListResponse> => apiRequest('/infantes', { schema: childListResponseSchema });

export const fetchRooms = (): Promise<RoomListResponse> => apiRequest('/salas', { schema: roomListResponseSchema });

export const enrollChild = (body: EnrollChildRequest): Promise<Child> =>
  apiRequest('/infantes', { method: 'POST', body, schema: childSchema });

export const updateChild = (id: number, body: UpdateChildRequest): Promise<Child> =>
  apiRequest(`/infantes/${id}`, { method: 'PATCH', body, schema: childSchema });

export const deleteChild = (id: number): Promise<void> => apiRequest(`/infantes/${id}`, { method: 'DELETE' });

export const updateGuardian = (id: number, body: UpdateGuardianRequest): Promise<Guardian> =>
  apiRequest(`/tutores/${id}`, { method: 'PATCH', body, schema: guardianSchema });

export const updateGuardianLink = (childId: number, guardianId: number, body: UpdateGuardianLinkRequest): Promise<ChildGuardian> =>
  apiRequest(`/infantes/${childId}/tutores/${guardianId}`, { method: 'PATCH', body, schema: childGuardianSchema });

export const unlinkGuardian = (childId: number, guardianId: number): Promise<void> =>
  apiRequest(`/infantes/${childId}/tutores/${guardianId}`, { method: 'DELETE' });

export const moveChild = (id: number, body: EnrollmentMovementRequest): Promise<void> =>
  apiRequest(`/infantes/${id}/movimientos`, { method: 'POST', body });

export const fetchTransferDestinations = (): Promise<TransferDestinationListResponse> =>
  apiRequest('/traslados/destinos', { schema: transferDestinationListResponseSchema });

export const fetchPendingTransfers = (): Promise<PendingTransferListResponse> =>
  apiRequest('/traslados/pendientes', { schema: pendingTransferListResponseSchema });

export const receiveTransfer = (enrollmentId: number, body: ReceiveTransferRequest): Promise<void> =>
  apiRequest(`/traslados/${enrollmentId}/recepcion`, { method: 'POST', body });

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
