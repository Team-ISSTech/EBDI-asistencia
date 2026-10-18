import { checkNewPassword, PASSWORD_MIN_LENGTH } from '@sirai/domain';
import { Button, Field } from '@sirai/ui';
import { type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ApiClientError } from '../../../lib/api-client';
import { postLoginPath } from '../post-login-path';
import { useSession, useSessionActions } from '../use-session';

const MESSAGES = {
  MUY_CORTA: `La contraseña nueva debe tener al menos ${PASSWORD_MIN_LENGTH} caracteres.`,
  IGUAL_A_LA_ACTUAL: 'La contraseña nueva debe ser distinta de la actual.',
} as const;

/** Lo que se puede comprobar sin el servidor; devuelve el aviso o `null` si todo está bien. */
const validate = (current: string, next: string, confirm: string): string | null => {
  const check = checkNewPassword(next, current);
  if (!check.ok) return MESSAGES[check.reason];
  return next === confirm ? null : 'La confirmación no coincide con la contraseña nueva.';
};

const serverMessage = (error: unknown): string | undefined => {
  if (!error) return undefined;
  return error instanceof ApiClientError ? error.message : 'No se pudo cambiar la contraseña. Intenta de nuevo.';
};

/**
 * Cambio de contraseña. Con una temporal es la única pantalla disponible (se
 * puede cerrar sesión, nada más); después, cualquier persona puede venir aquí.
 */
export function ChangePasswordPage() {
  const { data: session } = useSession();
  const { changePassword, logout } = useSessionActions();
  const navigate = useNavigate();
  const forced = session?.mustChangePassword ?? false;
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const message = problem ?? serverMessage(changePassword.error);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const found = validate(current, next, confirm);
    setProblem(found);
    if (found) return;
    changePassword.mutate({ currentPassword: current, newPassword: next }, { onSuccess: (updated) => navigate(postLoginPath(updated, undefined), { replace: true }) });
  };

  return (
    <main className="grid min-h-screen place-content-center p-8">
      <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-5" noValidate>
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--color-ink)]">
            {forced ? 'Cambia tu contraseña temporal' : 'Cambiar contraseña'}
          </h1>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {forced ? 'Para usar el sistema debes elegir una contraseña propia.' : 'Al cambiarla se cerrarán tus otras sesiones abiertas.'}
          </p>
        </div>
        <Field label={forced ? 'Contraseña temporal' : 'Contraseña actual'} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />
        <Field
          label="Contraseña nueva"
          type="password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          hint={`Al menos ${PASSWORD_MIN_LENGTH} caracteres.`}
          required
        />
        <Field label="Confirmar contraseña nueva" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required />
        {message ? (
          <p role="alert" className="text-sm text-[var(--color-danger)]">
            {message}
          </p>
        ) : null}
        <Button type="submit" loading={changePassword.isPending}>
          Cambiar contraseña
        </Button>
        {forced ? (
          <Button type="button" variant="ghost" loading={logout.isPending} onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/iniciar-sesion') })}>
            Cerrar sesión
          </Button>
        ) : (
          <Link to="/app" className="text-sm text-[var(--color-ink)] underline-offset-4 hover:underline">
            Volver
          </Link>
        )}
      </form>
    </main>
  );
}
