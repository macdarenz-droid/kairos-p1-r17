import type { LoadingVariant } from './registry';
import './kit.css';

export interface SkeletonProps {
  /** What is loading, read out by screen readers. */
  readonly label: string;
  readonly lines?: number;
  readonly variant?: LoadingVariant;
  /** `false`: read out politely without the status role, for a list below a form whose save line is the page's status. */
  readonly live?: boolean;
}

/** A loading placeholder: grey bars with a soft shimmer that stops under reduced motion. */
export function Skeleton({ label, lines = 3, variant, live = true }: SkeletonProps) {
  return <div role={live ? 'status' : undefined} aria-live={live ? undefined : 'polite'} className="kairos-skeleton" data-variant={variant}>
    <span className="kairos-visually-hidden">{label}</span>
    <div className="kairos-skeleton__bars" aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => <span key={index} className="kairos-skeleton__bar" />)}
    </div>
  </div>;
}
