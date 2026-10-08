import type { AssignmentInput, EstanciaSummary, User } from '@sirai/contracts';
import { Button, Card } from '@sirai/ui';
import { useState } from 'react';
import { AssignmentEditor } from './assignment-editor';

export interface RolesEditorCardProps {
  readonly user: User;
  readonly estancias: readonly EstanciaSummary[];
  readonly pending: boolean;
  readonly error: boolean;
  readonly onSave: (assignments: AssignmentInput[]) => void;
  readonly onCancel: () => void;
}

/** Edición de roles de un usuario existente. */
export function RolesEditorCard({ user, estancias, pending, error, onSave, onCancel }: RolesEditorCardProps) {
  const [draft, setDraft] = useState<AssignmentInput[]>(user.assignments);
  return (
    <Card className="mb-8">
      <h2 className="mb-3 font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--color-ink)]">Roles de {user.name}</h2>
      <AssignmentEditor value={draft} estancias={estancias} onChange={setDraft} />
      <div className="mt-4 flex gap-2">
        <Button onClick={() => onSave(draft)} loading={pending}>
          Guardar roles
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-[var(--color-danger)]">
          No se pudieron guardar los roles.
        </p>
      ) : null}
    </Card>
  );
}
