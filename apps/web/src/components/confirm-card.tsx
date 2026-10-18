import { Button, Card } from '@sirai/ui';
import type { ReactNode } from 'react';
import { ApiClientError } from '../lib/api-client';

export interface ConfirmCardProps {
  readonly message: ReactNode;
  readonly confirmLabel: string;
  readonly cancelLabel: string;
  readonly pending: boolean;
  readonly error: unknown;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

const errorText = (error: unknown): string | null => {
  if (!error) return null;
  return error instanceof ApiClientError ? error.message : 'No se pudo completar la operación.';
};

/** Confirmación de una acción que no se puede deshacer desde la pantalla; el motivo del rechazo se muestra aquí mismo. */
export function ConfirmCard({ message, confirmLabel, cancelLabel, pending, error, onConfirm, onCancel }: ConfirmCardProps) {
  const failure = errorText(error);
  return (
    <Card className="mb-6 flex flex-col gap-3 border-[var(--color-danger)]">
      <p className="text-sm text-[var(--color-ink)]">{message}</p>
      {failure ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {failure}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button variant="danger" loading={pending} onClick={onConfirm}>
          {confirmLabel}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          {cancelLabel}
        </Button>
      </div>
    </Card>
  );
}
