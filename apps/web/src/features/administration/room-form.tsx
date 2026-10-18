import type { CreateRoomRequest, RoomAdmin } from '@sirai/contracts';
import { SHIFTS, type Shift } from '@sirai/domain';
import { Button, Field, Select } from '@sirai/ui';
import { type FormEvent, useState } from 'react';
import { ApiClientError } from '../../lib/api-client';
import { SHIFT_LABELS } from './shift-labels';

export interface RoomFormProps {
  /** Con una sala es edición; sin ella, alta. */
  readonly room?: RoomAdmin;
  readonly pending: boolean;
  readonly error: unknown;
  readonly onSubmit: (body: CreateRoomRequest) => void;
}

const toNumberOrNull = (value: string): number | null => (value.trim() === '' ? null : Number(value));
const text = (value: number | null | undefined): string => (value === null || value === undefined ? '' : String(value));

const serverMessage = (error: unknown): string | undefined => {
  if (!error) return undefined;
  return error instanceof ApiClientError ? error.message : 'No se pudo guardar. Intenta de nuevo.';
};

/** Valida lo que se puede validar sin el servidor; devuelve el aviso o `null` si todo está bien. */
const validate = (name: string, min: number | null, max: number | null): string | null => {
  if (name.trim() === '') return 'Escribe el nombre de la sala.';
  if (min !== null && max !== null && min > max) return 'La edad mínima no puede ser mayor que la máxima.';
  return null;
};

const initialValues = (room: RoomAdmin | undefined) => ({
  name: room?.name ?? '',
  shift: room?.shift ?? ('MATUTINO' as Shift),
  minAge: text(room?.minAgeMonths),
  maxAge: text(room?.maxAgeMonths),
  capacity: text(room?.capacity),
});

/** Alta o edición de una sala (RF-32): nombre, turno, rango de edad y capacidad. */
export function RoomForm({ room, pending, error, onSubmit }: RoomFormProps) {
  const initial = initialValues(room);
  const [name, setName] = useState(initial.name);
  const [shift, setShift] = useState<Shift>(initial.shift);
  const [minAge, setMinAge] = useState(initial.minAge);
  const [maxAge, setMaxAge] = useState(initial.maxAge);
  const [capacity, setCapacity] = useState(initial.capacity);
  const [problem, setProblem] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const min = toNumberOrNull(minAge);
    const max = toNumberOrNull(maxAge);
    const found = validate(name, min, max);
    setProblem(found);
    if (!found) onSubmit({ name: name.trim(), shift, minAgeMonths: min, maxAgeMonths: max, capacity: toNumberOrNull(capacity) });
  };
  const message = problem ?? serverMessage(error);

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field label="Nombre" value={name} onChange={(e) => setName(e.target.value)} required />
      <Select label="Turno" value={shift} onChange={(e) => setShift(e.target.value as Shift)}>
        {SHIFTS.map((option) => (
          <option key={option} value={option}>
            {SHIFT_LABELS[option]}
          </option>
        ))}
      </Select>
      <Field label="Edad mínima (meses)" type="number" min={0} value={minAge} onChange={(e) => setMinAge(e.target.value)} />
      <Field label="Edad máxima (meses)" type="number" min={0} value={maxAge} onChange={(e) => setMaxAge(e.target.value)} />
      <Field label="Capacidad" type="number" min={1} value={capacity} onChange={(e) => setCapacity(e.target.value)} hint="Vacía significa sin límite." />
      {message ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {message}
        </p>
      ) : null}
      <Button type="submit" loading={pending} className="self-start">
        {room ? 'Guardar cambios' : 'Crear sala'}
      </Button>
    </form>
  );
}
