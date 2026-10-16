import type { ChildGuardian, RegisterContactRequest } from '@sirai/contracts';
import { CONTACT_CAUSES, type ContactResult } from '@sirai/domain';
import { Button, Field, Select, Textarea } from '@sirai/ui';
import { type FormEvent, useState } from 'react';
import { ApiClientError } from '../../lib/api-client';
import { CAUSE_LABELS } from './labels';

export interface ContactFormProps {
  readonly guardians: readonly ChildGuardian[];
  readonly pending: boolean;
  readonly error: unknown;
  readonly onSubmit: (body: RegisterContactRequest) => void;
}

const MISSING_DATA = 'Elige el tutor, la causa y la fecha estimada de retorno.';

const guardianLabel = (guardian: ChildGuardian): string => `${guardian.name} ${guardian.paternalSurname} (${guardian.relationship})`;

type Cause = (typeof CONTACT_CAUSES)[number];
const isCause = (value: string): value is Cause => (CONTACT_CAUSES as readonly string[]).includes(value);

/** Arma la solicitud según el resultado; `null` si falta algo de lo que ese resultado exige. */
const buildRequest = (result: ContactResult, f: { guardianId: string; cause: string; returnDate: string; notes: string }): RegisterContactRequest | null => {
  const notes = f.notes.trim() === '' ? {} : { notes: f.notes.trim() };
  if (result === 'SIN_RESPUESTA') return { result, ...(f.guardianId === '' ? {} : { guardianId: Number(f.guardianId) }), ...notes };
  if (f.guardianId === '' || !isCause(f.cause) || f.returnDate === '') return null;
  return { result, guardianId: Number(f.guardianId), cause: f.cause, expectedReturnDate: f.returnDate, ...notes };
};

/** Registro de un intento de llamada: si se habló con el tutor pide causa y retorno; si no contestó, basta el intento. */
export function ContactForm({ guardians, pending, error, onSubmit }: ContactFormProps) {
  const [result, setResult] = useState<ContactResult>('CONTACTADO');
  const [guardianId, setGuardianId] = useState('');
  const [cause, setCause] = useState('');
  const [returnDate, setReturnDate] = useState('');
  const [notes, setNotes] = useState('');
  const [invalid, setInvalid] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const request = buildRequest(result, { guardianId, cause, returnDate, notes });
    setInvalid(request === null);
    if (request) onSubmit(request);
  };
  const serverError = error ? (error instanceof ApiClientError ? error.message : 'No se pudo registrar la llamada.') : undefined;
  const reached = result === 'CONTACTADO';

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <fieldset className="flex gap-6">
        <legend className="mb-1 text-sm font-medium text-[var(--color-ink)]">Resultado de la llamada</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="result" checked={reached} onChange={() => setResult('CONTACTADO')} />
          Hablé con el tutor
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" name="result" checked={!reached} onChange={() => setResult('SIN_RESPUESTA')} />
          No contestó
        </label>
      </fieldset>
      <Select label="Tutor" value={guardianId} onChange={(e) => setGuardianId(e.target.value)}>
        <option value="">{reached ? 'Selecciona al tutor' : 'Sin especificar'}</option>
        {guardians.map((guardian) => (
          <option key={guardian.id} value={guardian.id}>
            {guardianLabel(guardian)}
          </option>
        ))}
      </Select>
      {reached ? (
        <>
          <Select label="Causa" value={cause} onChange={(e) => setCause(e.target.value)}>
            <option value="">Selecciona la causa</option>
            {CONTACT_CAUSES.map((option) => (
              <option key={option} value={option}>
                {CAUSE_LABELS[option]}
              </option>
            ))}
          </Select>
          <Field label="Fecha estimada de retorno" type="date" value={returnDate} onChange={(e) => setReturnDate(e.target.value)} />
        </>
      ) : null}
      <Textarea label="Notas de asesoría" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} hint="Se guardan cifradas y solo las ve personal autorizado." />
      {invalid || serverError ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {invalid ? MISSING_DATA : serverError}
        </p>
      ) : null}
      <Button type="submit" loading={pending} className="self-start">
        Registrar llamada
      </Button>
    </form>
  );
}
