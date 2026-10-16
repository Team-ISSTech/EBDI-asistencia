import type { EnrollChildRequest, Room } from '@sirai/contracts';
import { Button, Field, Select } from '@sirai/ui';
import { type FormEvent, useState } from 'react';
import { ApiClientError } from '../../lib/api-client';

export interface EnrollChildFormProps {
  readonly rooms: readonly Room[];
  readonly pending: boolean;
  readonly error: unknown;
  readonly onSubmit: (body: EnrollChildRequest) => void;
}

/** La matrícula repetida se señala en su campo; cualquier otro error, en un aviso general. */
const enrollmentError = (error: unknown): string | undefined =>
  error instanceof ApiClientError && error.code === 'CONFLICTO' ? error.message : undefined;

const generalError = (error: unknown): string | undefined => {
  if (!error || enrollmentError(error)) return undefined;
  return error instanceof ApiClientError ? error.message : 'No se pudo guardar. Intenta de nuevo.';
};

const blankToNull = (value: string): string | null => (value.trim() === '' ? null : value.trim());

/** Alta de infante con su inscripción inicial en una sala de la estancia. */
export function EnrollChildForm({ rooms, pending, error, onSubmit }: EnrollChildFormProps) {
  const [enrollmentNumber, setEnrollmentNumber] = useState('');
  const [name, setName] = useState('');
  const [paternalSurname, setPaternalSurname] = useState('');
  const [maternalSurname, setMaternalSurname] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [roomId, setRoomId] = useState('');
  const [hasDisability, setHasDisability] = useState(false);
  const [disabilityGroup, setDisabilityGroup] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit({
      enrollmentNumber,
      curp: null,
      name,
      paternalSurname,
      maternalSurname: blankToNull(maternalSurname),
      birthDate,
      gender: null,
      hasDisability,
      disabilityGroup: hasDisability ? blankToNull(disabilityGroup) : null,
      roomId: Number(roomId),
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field label="Matrícula" value={enrollmentNumber} onChange={(e) => setEnrollmentNumber(e.target.value)} required error={enrollmentError(error)} />
      <Field label="Nombre" value={name} onChange={(e) => setName(e.target.value)} required />
      <Field label="Apellido paterno" value={paternalSurname} onChange={(e) => setPaternalSurname(e.target.value)} required />
      <Field label="Apellido materno" value={maternalSurname} onChange={(e) => setMaternalSurname(e.target.value)} />
      <Field label="Fecha de nacimiento" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} required />
      <Select label="Sala" value={roomId} onChange={(e) => setRoomId(e.target.value)} required>
        <option value="">Selecciona una sala</option>
        {rooms.map((room) => (
          <option key={room.id} value={room.id}>
            {room.name}
          </option>
        ))}
      </Select>
      <label className="flex items-center gap-2 text-sm text-[var(--color-ink)]">
        <input type="checkbox" checked={hasDisability} onChange={(e) => setHasDisability(e.target.checked)} />
        Tiene discapacidad
      </label>
      {hasDisability ? (
        <Field
          label="Grupo de discapacidad"
          value={disabilityGroup}
          onChange={(e) => setDisabilityGroup(e.target.value)}
          hint="Dato de salud: se guarda cifrado y no aparece en el padrón."
        />
      ) : null}
      {generalError(error) ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {generalError(error)}
        </p>
      ) : null}
      <Button type="submit" loading={pending} className="self-start">
        Registrar infante
      </Button>
    </form>
  );
}
