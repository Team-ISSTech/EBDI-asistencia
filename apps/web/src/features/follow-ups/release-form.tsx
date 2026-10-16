import { Button, Field, Textarea } from '@sirai/ui';
import { type FormEvent, useState } from 'react';
import type { RegisterMedicalReleaseRequest } from '@sirai/contracts';
import { ApiClientError } from '../../lib/api-client';

export interface ReleaseFormProps {
  readonly pending: boolean;
  readonly error: unknown;
  readonly onSubmit: (body: RegisterMedicalReleaseRequest) => void;
}

const optional = (value: string): string | undefined => (value.trim() === '' ? undefined : value.trim());

/** Alta médica (RF-30): solo la fecha es obligatoria; las observaciones se guardan cifradas. */
export function ReleaseForm({ pending, error, onSubmit }: ReleaseFormProps) {
  const [date, setDate] = useState('');
  const [folio, setFolio] = useState('');
  const [observations, setObservations] = useState('');
  const [missingDate, setMissingDate] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setMissingDate(date === '');
    if (date === '') return;
    const folioValue = optional(folio);
    const observationsValue = optional(observations);
    onSubmit({ dischargeDate: date, ...(folioValue ? { folio: folioValue } : {}), ...(observationsValue ? { observations: observationsValue } : {}) });
  };
  const serverError = error ? (error instanceof ApiClientError ? error.message : 'No se pudo registrar el alta.') : undefined;

  return (
    <form onSubmit={submit} className="flex flex-col gap-4 rounded-[var(--radius-md)] border border-[var(--color-line)] p-4" noValidate>
      <h3 className="text-sm font-semibold text-[var(--color-ink)]">Alta médica</h3>
      <Field label="Fecha del alta" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      <Field label="Folio" value={folio} onChange={(e) => setFolio(e.target.value)} maxLength={100} />
      <Textarea label="Observaciones del médico" value={observations} onChange={(e) => setObservations(e.target.value)} maxLength={2000} hint="Son datos de salud: se guardan cifradas." />
      {missingDate || serverError ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {missingDate ? 'Indica la fecha del alta.' : serverError}
        </p>
      ) : null}
      <Button type="submit" loading={pending} className="self-start">
        Registrar alta médica
      </Button>
    </form>
  );
}
