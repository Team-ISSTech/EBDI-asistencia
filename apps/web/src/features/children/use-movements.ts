import type { EnrollmentMovementRequest, ReceiveTransferRequest } from '@sirai/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchPendingTransfers, fetchTransferDestinations, moveChild, receiveTransfer } from './api';

const CHILDREN_KEY = ['children'] as const;
const PENDING_KEY = ['transfers', 'pending'] as const;

/** Las estancias de destino solo se piden cuando el formulario de movimientos está abierto. */
export function useTransferDestinations() {
  return useQuery({ queryKey: ['transfers', 'destinations'], queryFn: fetchTransferDestinations });
}

/** Cada consulta de traslados queda auditada: solo se pide cuando la tarjeta se abre. */
export function usePendingTransfers() {
  return useQuery({ queryKey: PENDING_KEY, queryFn: fetchPendingTransfers });
}

export function useMoveChild() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, body }: { id: number; body: EnrollmentMovementRequest }) => moveChild(id, body),
    onSuccess: () => client.invalidateQueries({ queryKey: CHILDREN_KEY }),
  });
}

export function useReceiveTransfer() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ enrollmentId, body }: { enrollmentId: number; body: ReceiveTransferRequest }) => receiveTransfer(enrollmentId, body),
    onSuccess: () => Promise.all([client.invalidateQueries({ queryKey: PENDING_KEY }), client.invalidateQueries({ queryKey: CHILDREN_KEY })]),
  });
}
