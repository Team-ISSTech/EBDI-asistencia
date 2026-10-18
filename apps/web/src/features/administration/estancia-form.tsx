import type { CreateEstanciaRequest, EstanciaAdmin, UpdateEstanciaRequest } from '@sirai/contracts';
import { Button, Field, Select } from '@sirai/ui';
import { type FormEvent, useState } from 'react';
import { ApiClientError } from '../../lib/api-client';
import { MEXICO_TIME_ZONES } from './time-zones';

export interface EstanciaFormProps {
  /** Con una estancia es edición (la clave no se toca); sin ella, alta. */
  readonly estancia?: EstanciaAdmin;
  readonly pending: boolean;
  readonly error: unknown;
  readonly onCreate: (body: CreateEstanciaRequest) => void;
  readonly onUpdate: (body: UpdateEstanciaRequest) => void;
}

const MISSING = 'Escribe la clave y el nombre de la estancia.';
const blankToNull = (value: string): string | null => (value.trim() === '' ? null : value.trim());

/** El conflicto de clave va junto al campo; cualquier otro error, en un aviso general. */
const codeError = (error: unknown): string | undefined => (error instanceof ApiClientError && error.code === 'CONFLICTO' ? error.message : undefined);
const generalError = (error: unknown): string | undefined => {
  if (!error || codeError(error)) return undefined;
  return error instanceof ApiClientError ? error.message : 'No se pudo guardar. Intenta de nuevo.';
};

const isIncomplete = (name: string, code: string, editing: boolean): boolean => name.trim() === '' || (!editing && code.trim() === '');

function FormAlert({ message }: { readonly message: string | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-sm text-[var(--color-danger)]">
      {message}
    </p>
  );
}

/** Alta o edición de una estancia (RF-31): clave EBDI, nombre, región y zona horaria. */
export function EstanciaForm({ estancia, pending, error, onCreate, onUpdate }: EstanciaFormProps) {
  const [code, setCode] = useState('');
  const [name, setName] = useState(estancia?.name ?? '');
  const [region, setRegion] = useState(estancia?.region ?? '');
  const [timeZone, setTimeZone] = useState(estancia?.timeZone ?? MEXICO_TIME_ZONES[0]);
  const [missing, setMissing] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const incomplete = isIncomplete(name, code, Boolean(estancia));
    setMissing(incomplete);
    if (incomplete) return;
    if (estancia) onUpdate({ name: name.trim(), region: blankToNull(region), timeZone });
    else onCreate({ code: code.trim(), name: name.trim(), ur: null, region: blankToNull(region), address: null, timeZone });
  };
  const message = missing ? MISSING : generalError(error);

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      {estancia ? null : <Field label="Clave EBDI" value={code} onChange={(e) => setCode(e.target.value)} error={codeError(error)} required />}
      <Field label="Nombre" value={name} onChange={(e) => setName(e.target.value)} required />
      <Field label="Región" value={region} onChange={(e) => setRegion(e.target.value)} hint="Acota lo que ve cada supervisor regional." />
      <Select label="Zona horaria" value={timeZone} onChange={(e) => setTimeZone(e.target.value)}>
        {MEXICO_TIME_ZONES.map((zone) => (
          <option key={zone} value={zone}>
            {zone}
          </option>
        ))}
      </Select>
      <FormAlert message={message} />
      <Button type="submit" loading={pending} className="self-start">
        {estancia ? 'Guardar cambios' : 'Crear estancia'}
      </Button>
    </form>
  );
}
