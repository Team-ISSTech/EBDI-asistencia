import type { CreatedSystemResponse } from '@sirai/contracts';
import { Button, Card } from '@sirai/ui';

export interface NewSystemCredentialsProps {
  readonly created: CreatedSystemResponse;
  readonly onDone: () => void;
}

/**
 * Las credenciales de un sistema recién registrado. El secreto solo existe aquí:
 * en el servidor queda su hash, así que si se cierra esta pantalla sin copiarlo
 * hay que registrar un sistema nuevo.
 */
export function NewSystemCredentials({ created, onDone }: NewSystemCredentialsProps) {
  return (
    <Card className="mb-8 flex flex-col gap-3 border-[var(--color-accent)]">
      <h2 className="text-lg font-semibold text-[var(--color-ink)]">Credenciales de {created.system.name}</h2>
      <p className="text-sm text-[var(--color-text)]">
        Entrégalas al equipo del sistema por un medio seguro. <strong>No se vuelve a mostrar el secreto</strong>: si se pierde, hay que registrar un sistema nuevo.
      </p>
      <dl className="grid gap-2 text-sm">
        <div>
          <dt className="font-medium text-[var(--color-ink)]">Identificador (clientId)</dt>
          <dd className="break-all font-mono">{created.system.clientId}</dd>
        </div>
        <div>
          <dt className="font-medium text-[var(--color-ink)]">Secreto (clientSecret)</dt>
          <dd className="break-all font-mono">{created.clientSecret}</dd>
        </div>
      </dl>
      <Button className="self-start" onClick={onDone}>
        Ya guardé el secreto
      </Button>
    </Card>
  );
}
