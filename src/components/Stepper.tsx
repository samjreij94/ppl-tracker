import { useEffect, useState } from 'react';

interface Props {
  label: string;
  value: number;
  step: number;
  min?: number;
  max?: number;
  decimals?: number;
  suffix?: string;
  onChange: (v: number) => void;
}

const round = (v: number, d: number) => Number(v.toFixed(d));

/** Big +/- stepper; centre value is editable via numeric keypad. */
export function Stepper({ label, value, step, min = 0, max = 9999, decimals = 1, suffix, onChange }: Props) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const clamp = (v: number) => Math.min(max, Math.max(min, round(v, decimals)));
  const commit = () => {
    const n = parseFloat(draft.replace(',', '.'));
    if (Number.isFinite(n)) onChange(clamp(n));
    else setDraft(String(value));
  };
  return (
    <div className="stepper" role="group" aria-label={label}>
      <button type="button" aria-label={`Decrease ${label}`} onClick={() => onChange(clamp(value - step))}>−</button>
      <input
        className="num"
        inputMode="decimal"
        aria-label={suffix ? `${label} (${suffix})` : label}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
      />
      <button type="button" aria-label={`Increase ${label}`} onClick={() => onChange(clamp(value + step))}>+</button>
    </div>
  );
}
