import type { PendingTransfer, Room } from '@sirai/contracts';
import { Button, Card, EmptyState, Select, Table, Td, Th } from '@sirai/ui';
import { useState } from 'react';
import { ApiClientError } from '../../lib/api-client';
import { useRooms } from './use-children';
import { usePendingTransfers, useReceiveTransfer } from './use-movements';

interface RowProps {
  readonly transfer: PendingTransfer;
  readonly rooms: readonly Room[];
}

function TransferRow({ transfer, rooms }: RowProps) {
  const receive = useReceiveTransfer();
  const [roomId, setRoomId] = useState('');
  const failure = receive.error instanceof ApiClientError ? receive.error.message : receive.error ? 'No se pudo recibir el traslado.' : null;
  return (
    <tr>
      <Td className="font-medium text-[var(--color-ink)]">{transfer.childName}</Td>
      <Td>{transfer.enrollmentNumber}</Td>
      <Td>
        {transfer.fromEstanciaName}
        {transfer.reason ? <span className="block text-xs text-[var(--color-text-muted)]">{transfer.reason}</span> : null}
      </Td>
      <Td>
        <div className="flex items-end gap-2">
          <Select label={`Sala para ${transfer.childName}`} value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            <option value="">Selecciona una sala</option>
            {rooms.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
          </Select>
          <Button
            aria-label={`Recibir a ${transfer.childName}`}
            disabled={roomId === ''}
            loading={receive.isPending}
            onClick={() => receive.mutate({ enrollmentId: transfer.enrollmentId, body: { roomId: Number(roomId) } })}
          >
            Recibir
          </Button>
        </div>
        {failure ? (
          <p role="alert" className="mt-1 text-xs text-[var(--color-danger)]">
            {failure}
          </p>
        ) : null}
      </Td>
    </tr>
  );
}

/** Traslados que otras estancias enviaron a ésta y que aún no tienen sala. */
export function PendingTransfersCard() {
  const transfers = usePendingTransfers();
  const rooms = useRooms(true);
  return (
    <Card className="mb-8 flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-[var(--color-ink)]">Traslados pendientes</h2>
      {transfers.isPending ? <p className="text-sm text-[var(--color-text-muted)]">Cargando traslados…</p> : null}
      {transfers.isError ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          No se pudieron cargar los traslados.
        </p>
      ) : null}
      {transfers.data?.transfers.length === 0 ? <EmptyState title="No hay traslados por recibir" description="Cuando otra estancia traslade a un infante a ésta, aparecerá aquí para asignarle sala." /> : null}
      {transfers.data && transfers.data.transfers.length > 0 ? (
        <Table>
          <thead>
            <tr>
              <Th>Infante</Th>
              <Th>Matrícula</Th>
              <Th>Viene de</Th>
              <Th>Recepción</Th>
            </tr>
          </thead>
          <tbody>
            {transfers.data.transfers.map((transfer) => (
              <TransferRow key={transfer.enrollmentId} transfer={transfer} rooms={rooms.data?.rooms ?? []} />
            ))}
          </tbody>
        </Table>
      ) : null}
    </Card>
  );
}
