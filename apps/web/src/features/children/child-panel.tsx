import type { Child } from '@sirai/contracts';
import { Card } from '@sirai/ui';
import { ConfirmCard } from './confirm-card';
import { EditChildForm } from './edit-child-form';
import { useDeleteChild, useUpdateChild } from './use-children';

/** Edición o eliminación abierta sobre el padrón; solo una a la vez. */
export interface ChildPanelState {
  readonly kind: 'edit' | 'delete';
  readonly child: Child;
}

export interface ChildPanelProps {
  readonly state: ChildPanelState;
  readonly onDone: () => void;
  readonly onCancel: () => void;
}

function EditPanel({ child, onDone }: { readonly child: Child; readonly onDone: () => void }) {
  const update = useUpdateChild();
  return (
    <Card className="mb-8">
      <EditChildForm child={child} pending={update.isPending} error={update.error} onSubmit={(body) => update.mutate({ id: child.id, body }, { onSuccess: onDone })} />
    </Card>
  );
}

function DeletePanel({ child, onDone, onCancel }: { readonly child: Child; readonly onDone: () => void; readonly onCancel: () => void }) {
  const remove = useDeleteChild();
  return (
    <ConfirmCard
      message={
        <>
          ¿Eliminar a <strong>{child.name} {child.paternalSurname}</strong>? Eliminar corrige un alta equivocada: si ya tiene asistencia registrada, no se podrá.
        </>
      }
      confirmLabel="Confirmar eliminación"
      cancelLabel="Cancelar eliminación"
      pending={remove.isPending}
      error={remove.error}
      onConfirm={() => remove.mutate(child.id, { onSuccess: onDone })}
      onCancel={onCancel}
    />
  );
}

/** Cada panel lleva sus propias mutaciones: al abrir otro, el error del anterior no se arrastra. */
export function ChildPanel({ state, onDone, onCancel }: ChildPanelProps) {
  if (state.kind === 'edit') return <EditPanel key={state.child.id} child={state.child} onDone={onDone} />;
  return <DeletePanel key={state.child.id} child={state.child} onDone={onDone} onCancel={onCancel} />;
}
