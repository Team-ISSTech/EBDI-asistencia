import type { RegisterIncidentRequest } from '@sirai/contracts';
import { INCIDENT_TYPES, type IncidentType, MAX_INCIDENT_DESCRIPTION } from '@sirai/domain';
import { Button, Select, Textarea } from '@sirai/ui';
import { type FormEvent, useState } from 'react';
import { ApiClientError } from '../../lib/api-client';
import { INCIDENT_LABELS } from './status';

export interface IncidentFormProps {
  readonly pending: boolean;
  readonly error: unknown;
  /** Devuelve una promesa para limpiar el formulario solo si se guardó. */
  readonly onSubmit: (body: RegisterIncidentRequest) => Promise<unknown>;
}

const isIncidentType = (value: string): value is IncidentType => (INCIDENT_TYPES as readonly string[]).includes(value);

const errorText = (error: unknown): string => (error instanceof ApiClientError ? error.message : 'No se pudo registrar la incidencia. Revisa la conexión e intenta de nuevo.');

export function IncidentForm({ pending, error, onSubmit }: IncidentFormProps) {
  const [type, setType] = useState('');
  const [description, setDescription] = useState('');
  const [missing, setMissing] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const valid = isIncidentType(type) && description.trim() !== '';
    setMissing(!valid);
    if (!valid) return;
    void onSubmit({ type, description: description.trim() }).then(() => {
      setType('');
      setDescription('');
    }, () => undefined);
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3" noValidate>
      <Select label="Tipo de incidencia" value={type} onChange={(e) => setType(e.target.value)}>
        <option value="">Selecciona el tipo</option>
        {INCIDENT_TYPES.map((option) => (
          <option key={option} value={option}>
            {INCIDENT_LABELS[option]}
          </option>
        ))}
      </Select>
      <Textarea label="Qué pasó" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={MAX_INCIDENT_DESCRIPTION} hint="Se guarda cifrado; la descripción solo la lee personal autorizado." />
      {missing || error ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {missing ? 'Elige el tipo y describe qué pasó.' : errorText(error)}
        </p>
      ) : null}
      <Button type="submit" variant="ghost" loading={pending} className="self-start">
        Registrar incidencia
      </Button>
    </form>
  );
}
