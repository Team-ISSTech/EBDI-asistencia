import type { CreateSystemRequest } from '@sirai/contracts';
import { INTEGRATION_SCOPES, type IntegrationScope } from '@sirai/auth';
import { Button, Field } from '@sirai/ui';
import { type FormEvent, useState } from 'react';
import { Checkbox } from '../../components/checkbox';
import { ApiClientError } from '../../lib/api-client';
import { INTEGRATION_SCOPE_LABELS } from '../../lib/labels';

export interface SystemFormProps {
  readonly pending: boolean;
  readonly error: unknown;
  readonly onSubmit: (body: CreateSystemRequest) => void;
}

const serverMessage = (error: unknown): string | undefined => {
  if (!error) return undefined;
  return error instanceof ApiClientError ? error.message : 'No se pudo registrar el sistema. Intenta de nuevo.';
};

/** Lo que se puede comprobar sin el servidor; devuelve el aviso o `null` si todo está bien. */
const validate = (name: string, scopes: readonly IntegrationScope[]): string | null => {
  if (name.trim() === '') return 'Escribe el nombre del sistema.';
  return scopes.length === 0 ? 'Elige al menos un alcance.' : null;
};

/** Registro de un sistema externo: nombre y qué puede consultar. */
export function SystemForm({ pending, error, onSubmit }: SystemFormProps) {
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<readonly IntegrationScope[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const message = problem ?? serverMessage(error);

  const toggle = (scope: IntegrationScope, checked: boolean) =>
    setScopes((current) => (checked ? [...current, scope] : current.filter((item) => item !== scope)));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found = validate(name, scopes);
    setProblem(found);
    if (!found) onSubmit({ name: name.trim(), scopes: [...scopes] });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field label="Nombre" value={name} onChange={(e) => setName(e.target.value)} hint="Cómo se llama el sistema que va a conectarse." required />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-[var(--color-ink)]">Alcances</legend>
        {INTEGRATION_SCOPES.map((scope) => (
          <Checkbox key={scope} label={INTEGRATION_SCOPE_LABELS[scope]} checked={scopes.includes(scope)} onChange={(checked) => toggle(scope, checked)} />
        ))}
      </fieldset>
      {message ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {message}
        </p>
      ) : null}
      <Button type="submit" loading={pending} className="self-start">
        Crear sistema
      </Button>
    </form>
  );
}
