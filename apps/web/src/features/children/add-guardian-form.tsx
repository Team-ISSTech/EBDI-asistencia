import { Button, Field } from '@sirai/ui';
import { type FormEvent, useState } from 'react';
import { ApiClientError } from '../../lib/api-client';
import type { AddGuardianInput } from './use-guardians';

export interface AddGuardianFormProps {
  readonly pending: boolean;
  readonly error: unknown;
  readonly onSubmit: (input: AddGuardianInput) => void;
}

const errorMessage = (error: unknown): string | undefined => {
  if (!error) return undefined;
  return error instanceof ApiClientError ? error.message : 'No se pudo guardar. Intenta de nuevo.';
};

const blankToNull = (value: string): string | null => (value.trim() === '' ? null : value.trim());

interface CheckboxProps {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}

function Checkbox({ label, checked, onChange }: CheckboxProps) {
  return (
    <label className="flex items-center gap-2 text-sm text-[var(--color-ink)]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

const today = (): string => new Date().toISOString().slice(0, 10);

/** Alta del tutor y su vínculo con el infante, en un solo formulario. */
export function AddGuardianForm({ pending, error, onSubmit }: AddGuardianFormProps) {
  const [name, setName] = useState('');
  const [paternalSurname, setPaternalSurname] = useState('');
  const [maternalSurname, setMaternalSurname] = useState('');
  const [phone, setPhone] = useState('');
  const [relationship, setRelationship] = useState('');
  const [isPrimary, setIsPrimary] = useState(false);
  const [canPickUp, setCanPickUp] = useState(false);
  const [isEmergencyContact, setIsEmergencyContact] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit({
      guardian: { name, paternalSurname, maternalSurname: blankToNull(maternalSurname), idType: null, idFolio: null, phone, email: null },
      link: { relationship, isPrimary, canPickUp, isEmergencyContact, validFrom: today(), validUntil: null },
    });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field label="Nombre" value={name} onChange={(e) => setName(e.target.value)} required />
      <Field label="Apellido paterno" value={paternalSurname} onChange={(e) => setPaternalSurname(e.target.value)} required />
      <Field label="Apellido materno" value={maternalSurname} onChange={(e) => setMaternalSurname(e.target.value)} />
      <Field label="Teléfono" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} hint="Diez dígitos. Se guarda cifrado." required />
      <Field label="Parentesco" value={relationship} onChange={(e) => setRelationship(e.target.value)} required />
      <Checkbox label="Tutor principal" checked={isPrimary} onChange={setIsPrimary} />
      <Checkbox label="Autorizado para recoger" checked={canPickUp} onChange={setCanPickUp} />
      <Checkbox label="Contacto de emergencia" checked={isEmergencyContact} onChange={setIsEmergencyContact} />
      {errorMessage(error) ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {errorMessage(error)}
        </p>
      ) : null}
      <Button type="submit" loading={pending} className="self-start">
        Guardar tutor
      </Button>
    </form>
  );
}
