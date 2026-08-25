import type { ChangeEvent } from "react";
import { isPartialDecimal } from "../lib/format";

interface NumberFieldProps {
  label: string;
  unit: string;
  value: string;
  onChange: (value: string) => void;
}

export function NumberField({ label, unit, value, onChange }: NumberFieldProps) {
  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    if (isPartialDecimal(next)) onChange(next);
  };

  return (
    <label className="block mb-3">
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="text-[12.5px] font-medium text-ink-muted dark:text-ink-muted-dark">{label}</span>
        <span className="text-[11px] font-mono text-ink-faint dark:text-ink-faint-dark">{unit}</span>
      </div>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={handleChange}
        className="w-full box-border rounded-md border border-line dark:border-line-dark
                   bg-field dark:bg-field-dark px-2.5 py-2 text-[14.5px] font-mono
                   text-ink dark:text-ink-dark outline-none
                   focus:border-accent dark:focus:border-accent-dark
                   transition-colors"
      />
    </label>
  );
}
