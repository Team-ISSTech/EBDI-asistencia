import type { Child, ChildGuardian, UnlinkGuardianResponse } from '@sirai/contracts';
import { useState } from 'react';
import { Checkbox } from '../../components/checkbox';
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
  /** Con un aviso para mostrar tras cerrar el panel, si lo hay. */
  readonly onDone: (notice?: string) => void;
  readonly onCancel: () => void;
}

function AddPanel({ child, onDone }: { readonly child: Child; readonly onDone: () => void }) {
  const add = useAddGuardian(child.id);
  return <AddGuardianForm pending={add.isPending} error={add.error} onSubmit={(input) => add.mutate(input, { onSuccess: () => onDone() })} />;
}

function EditPanel({ child, guardian, onDone }: { readonly child: Child; readonly guardian: ChildGuardian; readonly onDone: () => void }) {
  const edit = useEditGuardian(child.id);
  return (
    <EditGuardianForm
      guardian={guardian}
      pending={edit.isPending}
      error={edit.error}
      onSubmit={(input) => edit.mutate({ guardianId: guardian.id, ...input }, { onSuccess: () => onDone() })}
    />
  );
}

interface UnlinkPanelProps {
  readonly child: Child;
  readonly guardian: ChildGuardian;
  readonly onDone: (notice?: string) => void;
  readonly onCancel: () => void;
}

/** Qué decir tras desvincular: solo hace falta avisar cuando se pidió la baja del tutor. */
const noticeFor = (result: UnlinkGuardianResponse, requested: boolean): string | undefined => {
  if (result.guardianRetired) return 'Tutor desvinculado y dado de baja.';
  return requested ? 'Tutor desvinculado. Sigue vinculado a otro infante, por eso no se dio de baja.' : undefined;
};

function UnlinkPanel({ child, guardian, onDone, onCancel }: UnlinkPanelProps) {
  const unlink = useUnlinkGuardian(child.id);
  const [retire, setRetire] = useState(false);
  return (
    <ConfirmCard
      message={
        <>
          ¿Desvincular a <strong>{guardian.name} {guardian.paternalSurname}</strong> de {child.name}? Su vigencia termina y el vínculo queda como historial; el tutor no se borra.
        </>
      }
      extra={<Checkbox label="Dar de baja también al tutor si no tiene más infantes vinculados" checked={retire} onChange={setRetire} />}
      confirmLabel="Confirmar desvinculación"
      cancelLabel="Cancelar desvinculación"
      pending={unlink.isPending}
      error={unlink.error}
      onConfirm={() => unlink.mutate({ guardianId: guardian.id, retireGuardian: retire }, { onSuccess: (result) => onDone(noticeFor(result, retire)) })}
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
