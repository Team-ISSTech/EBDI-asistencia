import type { AuthorizedPickup } from '@sirai/contracts';
import { Button } from '@sirai/ui';
import { type FormEvent, useState } from 'react';
import { ApiClientError } from '../../lib/api-client';

export interface DepartureFormProps {
  readonly guardians: readonly AuthorizedPickup[];
  readonly pending: boolean;
  readonly error: unknown;
  readonly onSubmit: (guardianId: number) => void;
}

const errorText = (error: unknown): string => (error instanceof ApiClientError ? error.message : 'No se pudo registrar la salida. Revisa la conexión e intenta de nuevo.');

/** S-27: solo se puede elegir a quien está autorizado a recoger al infante hoy. */
export function DepartureForm({ guardians, pending, error, onSubmit }: DepartureFormProps) {
  const [guardianId, setGuardianId] = useState<number | null>(null);
  const [missing, setMissing] = useState(false);

  if (guardians.length === 0) {
    return <p className="text-sm text-[var(--color-text)]">No hay tutores autorizados a recoger a este infante. La directora debe registrar quién puede recogerlo.</p>;
  }
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setMissing(guardianId === null);
    if (guardianId !== null) onSubmit(guardianId);
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-[var(--color-ink)]">¿Quién recoge?</legend>
        {guardians.map((guardian) => (
          <label key={guardian.id} className="flex items-center gap-2 text-sm">
            <input type="radio" name="pickup" checked={guardianId === guardian.id} onChange={() => setGuardianId(guardian.id)} />
            {guardian.name} <span className="text-[var(--color-text-muted)]">({guardian.relationship})</span>
          </label>
        ))}
      </fieldset>
      {missing || error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {missing ? 'Elige quién recoge al infante.' : errorText(error)}
        </p>
      ) : null}
      <Button type="submit" loading={pending} className="self-start">
        Confirmar salida
      </Button>
    </form>
  );
}
