import type { HTMLAttributes } from 'react';
import type { CardVariant } from './registry';
import './primitives.css';

export type CardProps = HTMLAttributes<HTMLElement> & {
  readonly as?: 'div' | 'section' | 'article' | 'form';
  readonly variant?: CardVariant;
  readonly noValidate?: boolean;
};

/** The shared card box; every other prop (data-*, aria-*, onSubmit) passes through. */
export function Card({ as: Element = 'div', variant = 'base', className, ...rest }: CardProps) {
  const classes = ['kairos-card', `kairos-card--${variant}`, className].filter(Boolean).join(' ');
  return <Element {...rest} className={classes} />;
}
