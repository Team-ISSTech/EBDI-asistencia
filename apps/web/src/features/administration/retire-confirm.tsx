import { Button, Card } from '@sirai/ui';

export interface RetireConfirmProps {
  /** Nombre de lo que se da de baja, para que la confirmación sea explícita. */
  readonly name: string;
  readonly pending: boolean;
  readonly onConfirm: () => void;
  readonly onCancel: () => void;
}

/** Confirmación de una baja: no se borra nada, pero deja de aparecer y no se puede deshacer desde aquí. */
export function RetireConfirm({ name, pending, onConfirm, onCancel }: RetireConfirmProps) {
  return (
    <Card className="mb-6 flex flex-col gap-3 border-[var(--color-danger)]">
      <p className="text-sm text-[var(--color-ink)]">
        ¿Dar de baja <strong>{name}</strong>? La baja conserva el historial, pero deja de aparecer en el sistema.
      </p>
      <div className="flex gap-2">
        <Button variant="danger" loading={pending} onClick={onConfirm}>
          Confirmar baja
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancelar baja
        </Button>
      </div>
    </Card>
  );
}
