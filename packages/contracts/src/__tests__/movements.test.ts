import { describe, expect, it } from 'vitest';
import {
  enrollmentMovementRequestSchema,
  pendingTransferListResponseSchema,
  receiveTransferRequestSchema,
  transferDestinationListResponseSchema,
} from '../catalogs/movement.js';

describe('enrollmentMovementRequestSchema (RF-35)', () => {
  it('cambio de sala pide la sala nueva y el motivo es opcional', () => {
    const parsed = enrollmentMovementRequestSchema.safeParse({ type: 'CAMBIO_SALA', roomId: 3 });
    expect(parsed.success && parsed.data).toEqual({ type: 'CAMBIO_SALA', roomId: 3, reason: null });
    expect(enrollmentMovementRequestSchema.safeParse({ type: 'CAMBIO_SALA' }).success).toBe(false);
  });

  it('la baja y el traslado exigen un motivo escrito', () => {
    expect(enrollmentMovementRequestSchema.safeParse({ type: 'BAJA' }).success).toBe(false);
    expect(enrollmentMovementRequestSchema.safeParse({ type: 'BAJA', reason: '   ' }).success).toBe(false);
    expect(enrollmentMovementRequestSchema.safeParse({ type: 'BAJA', reason: 'Cambio de domicilio' }).success).toBe(true);
    expect(enrollmentMovementRequestSchema.safeParse({ type: 'TRASLADO', destinationEstanciaId: 2 }).success).toBe(false);
    expect(enrollmentMovementRequestSchema.safeParse({ type: 'TRASLADO', destinationEstanciaId: 2, reason: 'Mudanza' }).success).toBe(true);
  });

  it('rechaza un tipo desconocido, el ALTA (no es un movimiento manual) y motivos largos', () => {
    expect(enrollmentMovementRequestSchema.safeParse({ type: 'ALTA', roomId: 1 }).success).toBe(false);
    expect(enrollmentMovementRequestSchema.safeParse({ type: 'BAJA', reason: 'x'.repeat(256) }).success).toBe(false);
  });
});

describe('traslados', () => {
  it('la recepción pide la sala de destino', () => {
    expect(receiveTransferRequestSchema.safeParse({ roomId: 4 }).success).toBe(true);
    expect(receiveTransferRequestSchema.safeParse({}).success).toBe(false);
  });

  it('los listados validan su forma', () => {
    expect(transferDestinationListResponseSchema.safeParse({ estancias: [{ id: 2, code: 'EBDI-002', name: 'Otra' }] }).success).toBe(true);
    expect(
      pendingTransferListResponseSchema.safeParse({
        transfers: [{ enrollmentId: 9, childName: 'Ana Pérez', enrollmentNumber: 'M-1', birthDate: '2025-01-01', fromEstanciaName: 'Origen', movedAt: '2026-10-17T10:00:00.000Z', reason: 'Mudanza' }],
      }).success,
    ).toBe(true);
  });
});
