import type { OpenSchoolYearRequest } from '@sirai/contracts';
import { Button, Field } from '@sirai/ui';
import { type FormEvent, useState } from 'react';
import { ApiClientError } from '../../lib/api-client';

export interface SchoolYearFormProps {
  readonly pending: boolean;
  readonly error: unknown;
  readonly onSubmit: (body: OpenSchoolYearRequest) => void;
}

const serverMessage = (error: unknown): string | undefined => {
  if (!error) return undefined;
  return error instanceof ApiClientError ? error.message : 'No se pudo abrir el ciclo. Intenta de nuevo.';
};

/** Lo que se puede comprobar sin el servidor; devuelve el aviso o `null` si todo está bien. */
const validate = (code: string, start: string, end: string): string | null => {
  if (code.trim() === '') return 'Escribe la clave del ciclo.';
  if (start === '' || end === '') return 'Indica cuándo empieza y cuándo termina el ciclo.';
  return end < start ? 'El fin del ciclo no puede ser anterior a su inicio.' : null;
};

/** Abre el ciclo escolar nuevo; el servidor archiva el actual si todo lo suyo está cerrado. */
export function SchoolYearForm({ pending, error, onSubmit }: SchoolYearFormProps) {
  const [code, setCode] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const message = problem ?? serverMessage(error);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found = validate(code, startDate, endDate);
    setProblem(found);
    if (!found) onSubmit({ code: code.trim(), startDate, endDate });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <p className="text-sm text-[var(--color-text)]">
        Abrir un ciclo nuevo archiva el ciclo actual, que queda de solo lectura y fuera de las pantallas diarias. Antes, todas sus jornadas y seguimientos deben estar cerrados.
      </p>
      <Field label="Clave" value={code} onChange={(e) => setCode(e.target.value)} hint="Por ejemplo 2027-2028." required />
      <Field label="Inicio" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
      <Field label="Fin" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
      {message ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {message}
        </p>
      ) : null}
      <Button type="submit" loading={pending} className="self-start">
        Archivar el actual y abrir este
      </Button>
    </form>
  );
}
