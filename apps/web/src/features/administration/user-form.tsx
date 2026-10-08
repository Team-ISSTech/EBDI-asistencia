import type { AssignmentInput, CreateUserRequest, EstanciaSummary } from '@sirai/contracts';
import { Button, Field } from '@sirai/ui';
import { type FormEvent, useState } from 'react';
import { ApiClientError } from '../../lib/api-client';
import { AssignmentEditor } from './assignment-editor';

export interface UserFormProps {
  readonly estancias: readonly EstanciaSummary[];
  readonly pending: boolean;
  readonly error: unknown;
  readonly onSubmit: (body: CreateUserRequest) => void;
}

const MIN_PASSWORD = 10;

/** El conflicto de correo va junto al campo; cualquier otro error, en un aviso general. */
const emailError = (error: unknown): string | undefined =>
  error instanceof ApiClientError && error.code === 'CONFLICTO' ? 'Ya existe un usuario con ese correo.' : undefined;

const generalError = (error: unknown): string | undefined => {
  if (!error || emailError(error)) return undefined;
  return error instanceof ApiClientError ? error.message : 'No se pudo guardar. Intenta de nuevo.';
};

/** Alta de usuario con contraseña temporal y roles iniciales. */
export function UserForm({ estancias, pending, error, onSubmit }: UserFormProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [temporaryPassword, setTemporaryPassword] = useState('');
  const [assignments, setAssignments] = useState<AssignmentInput[]>([]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    onSubmit({ name, email, temporaryPassword, assignments });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field label="Nombre" value={name} onChange={(e) => setName(e.target.value)} required />
      <Field label="Correo" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required error={emailError(error)} />
      <Field
        label="Contraseña temporal"
        type="text"
        autoComplete="off"
        value={temporaryPassword}
        onChange={(e) => setTemporaryPassword(e.target.value)}
        hint={`Mínimo ${MIN_PASSWORD} caracteres. La persona la cambiará al entrar.`}
        minLength={MIN_PASSWORD}
        required
      />
      <AssignmentEditor value={assignments} estancias={estancias} onChange={setAssignments} />
      {generalError(error) ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {generalError(error)}
        </p>
      ) : null}
      <Button type="submit" loading={pending} className="self-start">
        Crear usuario
      </Button>
    </form>
  );
}
