export interface CheckboxProps {
  readonly label: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}

export function Checkbox({ label, checked, onChange }: CheckboxProps) {
  return (
    <label className="flex items-center gap-2 text-sm text-[var(--color-ink)]">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
