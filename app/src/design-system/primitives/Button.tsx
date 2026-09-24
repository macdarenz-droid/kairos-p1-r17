import type { ButtonHTMLAttributes } from 'react';
import type { ButtonSize, ButtonVariant } from './registry';
import './primitives.css';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  /** Work in progress: the button is disabled and announced as busy. */
  readonly busy?: boolean;
}

/** The shared button. It never submits a form unless the caller asks for `type="submit"`. */
export function Button({ variant = 'primary', size = 'md', busy = false, type = 'button', className, disabled, ...rest }: ButtonProps) {
  const classes = ['kairos-button', `kairos-button--${variant}`, `kairos-button--${size}`, className].filter(Boolean).join(' ');
  return <button {...rest} type={type} className={classes} disabled={busy || disabled} aria-busy={busy ? true : undefined} />;
}
