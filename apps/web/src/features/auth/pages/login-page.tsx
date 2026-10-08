import { Button, Field } from '@sirai/ui';
import { type FormEvent, useState } from 'react';
import { Navigate, useLocation } from 'react-router';
import { loginErrorMessage } from '../error-messages';
import { LoginHero } from '../login-hero';
import { postLoginPath } from '../post-login-path';
import { useSession, useSessionActions } from '../use-session';

/**
 * La redirección depende solo de la sesión en caché, así no compite con una
 * navegación imperativa tras el login.
 */
export function LoginPage() {
  const session = useSession();
  const { login } = useSessionActions();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (session.data) {
    const from = (location.state as { from?: string } | null)?.from;
    return <Navigate to={postLoginPath(session.data, from)} replace />;
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    login.mutate({ email, password });
  };

  return (
    <main className="grid min-h-screen lg:grid-cols-[5fr_4fr]">
      <LoginHero />
      <section className="flex items-center justify-center p-8">
        <form onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-5" noValidate>
          <div>
            <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--color-ink)]">Iniciar sesión</h2>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">Usa el correo institucional que te asignó tu estancia.</p>
          </div>
          <Field label="Correo" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <Field
            label="Contraseña"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            error={login.isError ? loginErrorMessage(login.error) : undefined}
          />
          <Button type="submit" loading={login.isPending} className="mt-2">
            Entrar
          </Button>
        </form>
      </section>
    </main>
  );
}
