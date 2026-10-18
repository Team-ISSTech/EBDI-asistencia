import type { User } from '@sirai/contracts';
import { Button, Field, Select } from '@sirai/ui';
import { type FormEvent, useState } from 'react';
import type { AuditFilterValues } from './use-audit';

/** Día `YYYY-MM-DD` de la pantalla → instante de inicio o fin de ese día en la hora local del dispositivo. */
const startOfDay = (day: string): string => new Date(`${day}T00:00:00.000`).toISOString();
const endOfDay = (day: string): string => new Date(`${day}T23:59:59.999`).toISOString();

interface Fields {
  readonly from: string;
  readonly to: string;
  readonly userId: string;
  readonly action: string;
  readonly table: string;
  readonly recordId: string;
}

const EMPTY: Fields = { from: '', to: '', userId: '', action: '', table: '', recordId: '' };

/** Convierte lo escrito en filtros de la API; deja fuera lo vacío. */
const toFilters = (fields: Fields): AuditFilterValues => ({
  ...(fields.from === '' ? {} : { from: startOfDay(fields.from) }),
  ...(fields.to === '' ? {} : { to: endOfDay(fields.to) }),
  ...(fields.userId === '' ? {} : { userId: Number(fields.userId) }),
  ...(fields.action === '' ? {} : { action: fields.action }),
  ...(fields.table === '' ? {} : { table: fields.table }),
  ...(fields.recordId.trim() === '' ? {} : { recordId: fields.recordId.trim() }),
});

export interface AuditFiltersProps {
  readonly users: readonly User[];
  readonly actions: readonly string[];
  readonly tables: readonly string[];
  readonly onApply: (filters: AuditFilterValues) => void;
}

/** Filtros de la consulta: fechas, persona, acción, tabla y registro. */
export function AuditFilters({ users, actions, tables, onApply }: AuditFiltersProps) {
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [problem, setProblem] = useState<string | null>(null);
  const set = (change: Partial<Fields>) => setFields((current) => ({ ...current, ...change }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const inverted = fields.from !== '' && fields.to !== '' && fields.from > fields.to;
    setProblem(inverted ? 'La fecha inicial no puede ser posterior a la final.' : null);
    if (!inverted) onApply(toFilters(fields));
  };
  const clear = () => {
    setFields(EMPTY);
    setProblem(null);
    onApply({});
  };

  return (
    <form onSubmit={submit} className="mb-6 flex flex-col gap-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Field label="Desde" type="date" value={fields.from} onChange={(e) => set({ from: e.target.value })} />
        <Field label="Hasta" type="date" value={fields.to} onChange={(e) => set({ to: e.target.value })} />
        <Select label="Persona" value={fields.userId} onChange={(e) => set({ userId: e.target.value })}>
          <option value="">Todas</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </Select>
        <Select label="Acción" value={fields.action} onChange={(e) => set({ action: e.target.value })}>
          <option value="">Todas</option>
          {actions.map((action) => (
            <option key={action} value={action}>
              {action}
            </option>
          ))}
        </Select>
        <Select label="Tabla" value={fields.table} onChange={(e) => set({ table: e.target.value })}>
          <option value="">Todas</option>
          {tables.map((table) => (
            <option key={table} value={table}>
              {table}
            </option>
          ))}
        </Select>
        <Field label="Registro" value={fields.recordId} onChange={(e) => set({ recordId: e.target.value })} hint="Número del registro afectado." />
      </div>
      {problem ? (
        <p role="alert" className="text-sm text-[var(--color-danger)]">
          {problem}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit">Aplicar filtros</Button>
        <Button type="button" variant="ghost" onClick={clear}>
          Limpiar
        </Button>
      </div>
    </form>
  );
}
