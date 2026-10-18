import type { User } from '@sirai/contracts';
import { PASSWORD_MIN_LENGTH } from '@sirai/domain';
import { Button, Card, Field } from '@sirai/ui';
import { type FormEvent, useState } from 'react';
import { ApiClientError } from '../../lib/api-client';
import { useResetPassword } from './use-users';

export interface ResetPasswordCardProps {
  readonly user: User;
  readonly onClose: () => void;
}

const serverMessage = (error: unknown): string | undefined => {
  if (!error) return undefined;
  return error instanceof ApiClientError ? error.message : 'No se pudo restablecer la contraseña.';
};

/** Fija una contraseña temporal nueva; la persona deberá cambiarla al entrar y sus sesiones abiertas se cierran. */
export function ResetPasswordCard({ user, onClose }: ResetPasswordCardProps) {
  const reset = useResetPassword();
  const [password, setPassword] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const message = problem ?? serverMessage(reset.error);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const tooShort = password.length < PASSWORD_MIN_LENGTH;
    setProblem(tooShort ? `La contraseña temporal debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.` : null);
    if (!tooShort) reset.mutate({ userId: user.id, body: { temporaryPassword: password } }, { onSuccess: () => setPassword('') });
  };

  return (
    <Card className="mb-8 flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-[var(--color-ink)]">Restablecer la contraseña de {user.name}</h2>
      <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
        <Field label="Contraseña temporal" type="text" autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} hint="Se la entregas a la persona por un medio seguro. Caduca y debe cambiarla al entrar." />
        {message ? (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {message}
          </p>
        ) : null}
        {reset.isSuccess ? (
          <p role="status" className="text-sm font-medium text-[var(--color-ink)]">
            Contraseña restablecida para {user.name}: deberá cambiarla al entrar y sus sesiones abiertas se cerraron.
          </p>
        ) : null}
        <div className="flex gap-2">
          <Button type="submit" loading={reset.isPending}>
            Restablecer contraseña
          </Button>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cerrar
          </Button>
        </div>
      </form>
    </Card>
  );
}
