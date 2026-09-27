import type { ButtonHTMLAttributes, Ref } from 'react';
import type { ButtonSize, ButtonVariant } from './registry';
import './primitives.css';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  /** Work in progress: the button is disabled and announced as busy. */
  readonly busy?: boolean;
  /** One soft glow per screen at most (D183): `main` for the main action, `insight` for coach and patterns. */
  readonly emphasis?: 'main' | 'insight';
  /** React 19 passes `ref` as a prop; it reaches the button element. */
  readonly ref?: Ref<HTMLButtonElement>;
}

/** The shared button. It never submits a form unless the caller asks for `type="submit"`. */
export function Button({ variant = 'primary', size = 'md', busy = false, emphasis, type = 'button', className, disabled, ...rest }: ButtonProps) {
  const classes = ['kairos-button', `kairos-button--${variant}`, `kairos-button--${size}`, className].filter(Boolean).join(' ');
  return <button {...rest} type={type} className={classes} disabled={busy || disabled} aria-busy={busy ? true : undefined} data-kairos-emphasis={emphasis} />;
}
