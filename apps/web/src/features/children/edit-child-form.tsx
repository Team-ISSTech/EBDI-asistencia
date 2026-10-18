import type { Child, UpdateChildRequest } from '@sirai/contracts';
import { Button, Field } from '@sirai/ui';
import { type FormEvent, useState } from 'react';
import { ApiClientError } from '../../lib/api-client';

export interface EditChildFormProps {
  readonly child: Child;
  readonly pending: boolean;
  readonly error: unknown;
  readonly onSubmit: (body: UpdateChildRequest) => void;
}

const blankToNull = (value: string): string | null => (value.trim() === '' ? null : value.trim());

const serverMessage = (error: unknown): string | undefined => {
  if (!error) return undefined;
  return error instanceof ApiClientError ? error.message : 'No se pudo guardar. Intenta de nuevo.';
};

/** Corrección de los datos de un infante. La matrícula no se edita; el grupo de discapacidad solo se reemplaza si se escribe uno. */
export function EditChildForm({ child, pending, error, onSubmit }: EditChildFormProps) {
  const [name, setName] = useState(child.name);
  const [paternalSurname, setPaternalSurname] = useState(child.paternalSurname);
  const [maternalSurname, setMaternalSurname] = useState(child.maternalSurname ?? '');
  const [birthDate, setBirthDate] = useState(child.birthDate);
  const [hasDisability, setHasDisability] = useState(child.hasDisability);
  const [disabilityGroup, setDisabilityGroup] = useState('');

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const group = hasDisability ? blankToNull(disabilityGroup) : null;
    onSubmit({
      name: name.trim(),
      paternalSurname: paternalSurname.trim(),
      maternalSurname: blankToNull(maternalSurname),
      birthDate,
      hasDisability,
      ...(group === null ? {} : { disabilityGroup: group }),
    });
  };
  const message = serverMessage(error);

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field label="Nombre" value={name} onChange={(e) => setName(e.target.value)} required />
      <Field label="Apellido paterno" value={paternalSurname} onChange={(e) => setPaternalSurname(e.target.value)} required />
      <Field label="Apellido materno" value={maternalSurname} onChange={(e) => setMaternalSurname(e.target.value)} />
      <Field label="Fecha de nacimiento" type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} required />
      <label className="flex items-center gap-2 text-sm text-[var(--color-ink)]">
        <input type="checkbox" checked={hasDisability} onChange={(e) => setHasDisability(e.target.checked)} />
        Tiene discapacidad
      </label>
      {hasDisability ? (
        <Field
          label="Grupo de discapacidad (vacío para no cambiarlo)"
          value={disabilityGroup}
          onChange={(e) => setDisabilityGroup(e.target.value)}
          hint="Dato de salud: se guarda cifrado y no se muestra."
        />
      ) : null}
      {message ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {message}
        </p>
      ) : null}
      <Button type="submit" loading={pending} className="self-start">
        Guardar cambios
      </Button>
    </form>
  );
}
