import { CENTRAL_ROLE_CODES, ROLE_CODES, type RoleCode } from '@sirai/auth';
import type { AssignmentInput, EstanciaSummary } from '@sirai/contracts';
import { Button } from '@sirai/ui';
import { ROLE_LABELS } from '../../lib/labels';

export interface AssignmentEditorProps {
  readonly value: readonly AssignmentInput[];
  readonly estancias: readonly EstanciaSummary[];
  readonly onChange: (next: AssignmentInput[]) => void;
}


const SELECT_CLASS =
  'rounded-[var(--radius-md)] border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]';

const isCentral = (role: RoleCode): boolean => CENTRAL_ROLE_CODES.includes(role);

/** Lista editable de (rol, estancia). Los roles centrales no llevan estancia. */
export function AssignmentEditor({ value, estancias, onChange }: AssignmentEditorProps) {
  const update = (index: number, patch: Partial<AssignmentInput>) =>
    onChange(value.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  const remove = (index: number) => onChange(value.filter((_, i) => i !== index));
  /** Sin estancias disponibles solo cabe un rol central; nunca un rol de estancia sin estancia. */
  const add = () => {
    const first = estancias[0];
    onChange([...value, first ? { role: 'DOCENTE', estanciaId: first.id } : { role: 'SUPERVISOR_CENTRAL', estanciaId: null }]);
  };
  const changeRole = (index: number, role: RoleCode) =>
    update(index, { role, estanciaId: isCentral(role) ? null : (value[index]?.estanciaId ?? estancias[0]?.id ?? null) });

  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-sm font-medium text-[var(--color-ink)]">Roles</legend>
      {value.map((assignment, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2">
          <select
            aria-label={`Rol ${index + 1}`}
            className={SELECT_CLASS}
            value={assignment.role}
            onChange={(event) => changeRole(index, event.target.value as RoleCode)}
          >
            {ROLE_CODES.map((role) => (
              <option key={role} value={role}>
                {ROLE_LABELS[role]}
              </option>
            ))}
          </select>
          {isCentral(assignment.role) ? (
            <span className="text-sm text-[var(--color-text-muted)]">Todas las estancias</span>
          ) : (
            <select
              aria-label={`Estancia del rol ${index + 1}`}
              className={SELECT_CLASS}
              value={assignment.estanciaId ?? ''}
              onChange={(event) => update(index, { estanciaId: Number(event.target.value) })}
            >
              {estancias.map((estancia) => (
                <option key={estancia.id} value={estancia.id}>
                  {estancia.name}
                </option>
              ))}
            </select>
          )}
          <Button variant="ghost" onClick={() => remove(index)} aria-label={`Quitar rol ${index + 1}`}>
            Quitar
          </Button>
        </div>
      ))}
      <Button variant="secondary" onClick={add} className="self-start">
        Agregar rol
      </Button>
    </fieldset>
  );
}
