import type { RoomAdmin } from '@sirai/contracts';
import { Badge, Button, Table, Td, Th } from '@sirai/ui';
import { SHIFT_LABELS } from './shift-labels';

const ages = (room: RoomAdmin): string => {
  if (room.minAgeMonths === null && room.maxAgeMonths === null) return 'Sin rango';
  if (room.minAgeMonths === null) return `Hasta ${room.maxAgeMonths} meses`;
  if (room.maxAgeMonths === null) return `Desde ${room.minAgeMonths} meses`;
  return `${room.minAgeMonths} a ${room.maxAgeMonths} meses`;
};

export interface RoomsTableProps {
  readonly rooms: readonly RoomAdmin[];
  readonly onEdit: (room: RoomAdmin) => void;
  readonly onToggle: (room: RoomAdmin) => void;
  readonly onRetire: (room: RoomAdmin) => void;
}

/** Salas de la estancia con su ocupación; las acciones nombran la sala para los lectores de pantalla. */
export function RoomsTable({ rooms, onEdit, onToggle, onRetire }: RoomsTableProps) {
  return (
    <Table>
      <thead>
        <tr>
          <Th>Sala</Th>
          <Th>Turno</Th>
          <Th>Edades</Th>
          <Th>Inscritos</Th>
          <Th>Estatus</Th>
          <Th>
            <span className="sr-only">Acciones</span>
          </Th>
        </tr>
      </thead>
      <tbody>
        {rooms.map((room) => (
          <tr key={room.id}>
            <Td className="font-medium text-[var(--color-ink)]">{room.name}</Td>
            <Td>{SHIFT_LABELS[room.shift]}</Td>
            <Td className="whitespace-nowrap text-[var(--color-text-muted)]">{ages(room)}</Td>
            <Td>{room.capacity === null ? 'Sin límite' : `${room.enrolled} de ${room.capacity}`}</Td>
            <Td>
              <Badge tone={room.status === 'ACTIVO' ? 'success' : 'neutral'}>{room.status === 'ACTIVO' ? 'Activa' : 'Inactiva'}</Badge>
            </Td>
            <Td className="whitespace-nowrap">
              <Button variant="ghost" aria-label={`Editar ${room.name}`} onClick={() => onEdit(room)}>
                Editar
              </Button>
              <Button variant="ghost" aria-label={`${room.status === 'ACTIVO' ? 'Desactivar' : 'Reactivar'} ${room.name}`} onClick={() => onToggle(room)}>
                {room.status === 'ACTIVO' ? 'Desactivar' : 'Reactivar'}
              </Button>
              <Button variant="ghost" aria-label={`Dar de baja ${room.name}`} onClick={() => onRetire(room)}>
                Dar de baja
              </Button>
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}
