import type { Child, ChildGuardian } from '@sirai/contracts';
import { AddGuardianForm } from './add-guardian-form';
import { ConfirmCard } from '../../components/confirm-card';
import { EditGuardianForm } from './edit-guardian-form';
import { useAddGuardian, useEditGuardian, useUnlinkGuardian } from './use-guardians';

/** Qué formulario o confirmación está abierto sobre la lista de tutores; solo uno a la vez. */
export type GuardianPanelState =
  | { readonly kind: 'add' }
  | { readonly kind: 'edit'; readonly guardian: ChildGuardian }
  | { readonly kind: 'unlink'; readonly guardian: ChildGuardian };

export interface GuardianPanelProps {
  readonly child: Child;
  readonly state: GuardianPanelState;
  readonly onDone: () => void;
  readonly onCancel: () => void;
}

function AddPanel({ child, onDone }: { readonly child: Child; readonly onDone: () => void }) {
  const add = useAddGuardian(child.id);
  return <AddGuardianForm pending={add.isPending} error={add.error} onSubmit={(input) => add.mutate(input, { onSuccess: onDone })} />;
}

function EditPanel({ child, guardian, onDone }: { readonly child: Child; readonly guardian: ChildGuardian; readonly onDone: () => void }) {
  const edit = useEditGuardian(child.id);
  return (
    <EditGuardianForm
      guardian={guardian}
      pending={edit.isPending}
      error={edit.error}
      onSubmit={(input) => edit.mutate({ guardianId: guardian.id, ...input }, { onSuccess: onDone })}
    />
  );
}

interface UnlinkPanelProps {
  readonly child: Child;
  readonly guardian: ChildGuardian;
  readonly onDone: () => void;
  readonly onCancel: () => void;
}

function UnlinkPanel({ child, guardian, onDone, onCancel }: UnlinkPanelProps) {
  const unlink = useUnlinkGuardian(child.id);
  return (
    <ConfirmCard
      message={
        <>
          ¿Desvincular a <strong>{guardian.name} {guardian.paternalSurname}</strong> de {child.name}? Su vigencia termina y el vínculo queda como historial; el tutor no se borra.
        </>
      }
      confirmLabel="Confirmar desvinculación"
      cancelLabel="Cancelar desvinculación"
      pending={unlink.isPending}
      error={unlink.error}
      onConfirm={() => unlink.mutate(guardian.id, { onSuccess: onDone })}
      onCancel={onCancel}
    />
  );
}

/** Cada panel lleva sus propias mutaciones: al abrir otro, el error del anterior no se arrastra. */
export function GuardianPanel({ child, state, onDone, onCancel }: GuardianPanelProps) {
  if (state.kind === 'add') return <AddPanel child={child} onDone={onDone} />;
  if (state.kind === 'edit') return <EditPanel key={state.guardian.id} child={child} guardian={state.guardian} onDone={onDone} />;
  return <UnlinkPanel key={state.guardian.id} child={child} guardian={state.guardian} onDone={onDone} onCancel={onCancel} />;
}
