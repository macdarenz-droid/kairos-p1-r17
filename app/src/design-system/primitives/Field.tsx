import { useId, type ReactNode } from 'react';
import type { InputSize } from './registry';
import './primitives.css';

/** Accessibility wiring the caller spreads onto its own input or select. */
export interface FieldControlProps {
  readonly id: string;
  readonly 'aria-describedby'?: string;
  readonly 'aria-invalid'?: true;
  readonly 'aria-required'?: true;
}

export interface FieldProps {
  readonly label: string;
  readonly id?: string;
  readonly required?: boolean;
  readonly hint?: ReactNode;
  readonly invalid?: boolean;
  /** Shown under the control and read as its description; the form's banner stays the one alert. */
  readonly error?: string;
  readonly size?: InputSize;
  readonly wide?: boolean;
  readonly className?: string;
  readonly children: (control: FieldControlProps) => ReactNode;
}

/** One label, one control, an optional hint and an optional error, wired for screen readers. */
export function Field({ label, id, required = false, hint, invalid = false, error, size = 'md', wide = false, className, children }: FieldProps) {
  const autoId = useId();
  const controlId = id ?? autoId;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ');
  const control: FieldControlProps = {
    id: controlId,
    ...(describedBy ? { 'aria-describedby': describedBy } : {}),
    ...(invalid || error ? { 'aria-invalid': true as const } : {}),
    ...(required ? { 'aria-required': true as const } : {}),
  };
  const classes = ['kairos-form-field', `kairos-form-field--${size}`, invalid || error ? 'kairos-form-field--error' : null, wide ? 'kairos-form-field--wide' : null, className].filter(Boolean).join(' ');
  return <div className={classes}>
    <label htmlFor={controlId}>{label}{required ? <> <strong>Required</strong></> : null}</label>
    {children(control)}
    {hint ? <small id={hintId} className="kairos-form-field__hint">{hint}</small> : null}
    {error ? <small id={errorId} className="kairos-form-field__error">{error}</small> : null}
  </div>;
}
