import { useState, useEffect, InputHTMLAttributes } from 'react';

/**
 * NumericInput — drop-in replacement for <input type="number">.
 *
 * Fixes the "stuck zero" bug: when the user clears the field the value
 * shows as empty (not 0), so they can type a new number without fighting
 * the snap-back behaviour that `value={someNumber}` causes.
 *
 * Usage:
 *   <NumericInput value={stipend} onChange={setStipend} min={0} className={INPUT_CLS} />
 *
 * onChange receives a number (0 when the field is empty/invalid).
 */
interface NumericInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value' | 'type'> {
  value: number;
  onChange: (value: number) => void;
}

export function NumericInput({ value, onChange, ...rest }: NumericInputProps) {
  // Keep a local string so the field can show '' while the user is mid-edit.
  const [display, setDisplay] = useState<string>(value === 0 ? '' : String(value));

  // Sync when the parent changes value from outside (e.g. form reset).
  useEffect(() => {
    setDisplay(value === 0 ? '' : String(value));
  }, [value]);

  return (
    <input
      {...rest}
      type="number"
      value={display}
      onChange={(e) => {
        const raw = e.target.value;
        setDisplay(raw);
        onChange(raw === '' ? 0 : +raw);
      }}
      onBlur={(e) => {
        // Normalise on blur: empty → show '' (not '0')
        if (display === '' || display === '-') {
          setDisplay('');
          onChange(0);
        }
        rest.onBlur?.(e);
      }}
    />
  );
}
