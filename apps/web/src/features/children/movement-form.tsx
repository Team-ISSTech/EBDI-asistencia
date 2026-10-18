import type { Child, EnrollmentMovementRequest, Room, TransferDestination } from '@sirai/contracts';
import { Button, Field, Select } from '@sirai/ui';
import { type FormEvent, useState } from 'react';
import { ApiClientError } from '../../lib/api-client';

type MovementType = EnrollmentMovementRequest['type'];

const LABELS: Readonly<Record<MovementType, string>> = {
  CAMBIO_SALA: 'Cambio de sala',
  TRASLADO: 'Traslado a otra estancia',
  BAJA: 'Baja',
};
const TYPES = Object.keys(LABELS) as MovementType[];

const HINTS: Readonly<Record<MovementType, string>> = {
  CAMBIO_SALA: 'El infante sigue inscrito en la estancia, en otra sala.',
  TRASLADO: 'Sale de esta estancia y queda pendiente hasta que la estancia de destino lo reciba.',
  BAJA: 'El infante sale del padrón. La baja se conserva en el historial de movimientos.',
};

interface Fields {
  readonly roomId: string;
  readonly destinationId: string;
  readonly reason: string;
}

type Built = { readonly body: EnrollmentMovementRequest } | { readonly problem: string };

/** Arma el cuerpo del movimiento o dice qué falta, sin llamar al servidor. */
const build = (type: MovementType, { roomId, destinationId, reason }: Fields): Built => {
  const text = reason.trim();
  if (type === 'CAMBIO_SALA') return roomId === '' ? { problem: 'Elige la sala nueva.' } : { body: { type, roomId: Number(roomId), reason: text === '' ? null : text } };
  if (text === '') return { problem: 'Escribe el motivo.' };
  if (type === 'BAJA') return { body: { type, reason: text } };
  return destinationId === '' ? { problem: 'Elige la estancia de destino.' } : { body: { type, destinationEstanciaId: Number(destinationId), reason: text } };
};

const serverMessage = (error: unknown): string | undefined => {
  if (!error) return undefined;
  return error instanceof ApiClientError ? error.message : 'No se pudo registrar el movimiento.';
};

export interface MovementFormProps {
  readonly child: Child;
  readonly rooms: readonly Room[];
  readonly destinations: readonly TransferDestination[];
  readonly pending: boolean;
  readonly error: unknown;
  readonly onSubmit: (body: EnrollmentMovementRequest) => void;
}

/** Cambio de sala, traslado o baja de la inscripción activa del infante (RF-35). */
export function MovementForm({ child, rooms, destinations, pending, error, onSubmit }: MovementFormProps) {
  const [type, setType] = useState<MovementType>('CAMBIO_SALA');
  const [fields, setFields] = useState<Fields>({ roomId: '', destinationId: '', reason: '' });
  const [problem, setProblem] = useState<string | null>(null);
  const set = (change: Partial<Fields>) => setFields((current) => ({ ...current, ...change }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const built = build(type, fields);
    setProblem('problem' in built ? built.problem : null);
    if ('body' in built) onSubmit(built.body);
  };
  const message = problem ?? serverMessage(error);

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Select label="Movimiento" value={type} onChange={(e) => setType(e.target.value as MovementType)}>
        {TYPES.map((option) => (
          <option key={option} value={option}>
            {LABELS[option]}
          </option>
        ))}
      </Select>
      <p className="text-sm text-[var(--color-text-muted)]">{HINTS[type]}</p>
      {type === 'CAMBIO_SALA' ? (
        <Select label="Sala nueva" value={fields.roomId} onChange={(e) => set({ roomId: e.target.value })}>
          <option value="">Selecciona una sala</option>
          {rooms
            .filter((room) => room.id !== child.roomId)
            .map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
              </option>
            ))}
        </Select>
      ) : null}
      {type === 'TRASLADO' ? (
        <Select label="Estancia de destino" value={fields.destinationId} onChange={(e) => set({ destinationId: e.target.value })}>
          <option value="">Selecciona una estancia</option>
          {destinations.map((estancia) => (
            <option key={estancia.id} value={estancia.id}>
              {estancia.name}
            </option>
          ))}
        </Select>
      ) : null}
      <Field label="Motivo" value={fields.reason} onChange={(e) => set({ reason: e.target.value })} hint={type === 'CAMBIO_SALA' ? 'Opcional.' : 'Obligatorio.'} />
      {message ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {message}
        </p>
      ) : null}
      <Button type="submit" loading={pending} className="self-start">
        Registrar movimiento
      </Button>
    </form>
  );
}
