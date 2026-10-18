import type { ChildGuardian, UpdateGuardianLinkRequest, UpdateGuardianRequest } from '@sirai/contracts';
import { Button, Field } from '@sirai/ui';
import { type FormEvent, useState } from 'react';
import { ApiClientError } from '../../lib/api-client';
import { Checkbox } from '../../components/checkbox';

export interface EditGuardianFormProps {
  readonly guardian: ChildGuardian;
  readonly pending: boolean;
  readonly error: unknown;
  readonly onSubmit: (input: { guardian: UpdateGuardianRequest; link: UpdateGuardianLinkRequest }) => void;
}

const blankToNull = (value: string): string | null => (value.trim() === '' ? null : value.trim());

const serverMessage = (error: unknown): string | undefined => {
  if (!error) return undefined;
  return error instanceof ApiClientError ? error.message : 'No se pudo guardar. Intenta de nuevo.';
};

/** Datos del tutor y permisos de su vínculo. El teléfono actual no se muestra: solo se reemplaza si se escribe uno. */
export function EditGuardianForm({ guardian, pending, error, onSubmit }: EditGuardianFormProps) {
  const [name, setName] = useState(guardian.name);
  const [paternalSurname, setPaternalSurname] = useState(guardian.paternalSurname);
  const [maternalSurname, setMaternalSurname] = useState(guardian.maternalSurname ?? '');
  const [phone, setPhone] = useState('');
  const [relationship, setRelationship] = useState(guardian.relationship);
  const [isPrimary, setIsPrimary] = useState(guardian.isPrimary);
  const [canPickUp, setCanPickUp] = useState(guardian.canPickUp);
  const [isEmergencyContact, setIsEmergencyContact] = useState(guardian.isEmergencyContact);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const newPhone = blankToNull(phone);
    onSubmit({
      guardian: {
        name: name.trim(),
        paternalSurname: paternalSurname.trim(),
        maternalSurname: blankToNull(maternalSurname),
        ...(newPhone === null ? {} : { phone: newPhone }),
      },
      link: { relationship: relationship.trim(), isPrimary, canPickUp, isEmergencyContact },
    });
  };
  const message = serverMessage(error);

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field label="Nombre" value={name} onChange={(e) => setName(e.target.value)} required />
      <Field label="Apellido paterno" value={paternalSurname} onChange={(e) => setPaternalSurname(e.target.value)} required />
      <Field label="Apellido materno" value={maternalSurname} onChange={(e) => setMaternalSurname(e.target.value)} />
      <Field label="Teléfono nuevo (vacío para no cambiarlo)" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} hint="Se guarda cifrado." />
      <Field label="Parentesco" value={relationship} onChange={(e) => setRelationship(e.target.value)} required />
      <Checkbox label="Tutor principal" checked={isPrimary} onChange={setIsPrimary} />
      <Checkbox label="Autorizado para recoger" checked={canPickUp} onChange={setCanPickUp} />
      <Checkbox label="Contacto de emergencia" checked={isEmergencyContact} onChange={setIsEmergencyContact} />
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
