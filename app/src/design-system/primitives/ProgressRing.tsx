import type { ReactNode } from 'react';
import './kit.css';

/** U13 (D249): what a ring or bar says with colour; ✓ ! ? and words beside it always say it too. */
export type ProgressTone = 'progress' | 'reached' | 'inside' | 'over' | 'unknown';

const clampFill = (fill: number): number => (Number.isFinite(fill) ? Math.min(100, Math.max(0, Math.round(fill))) : 0);

/**
 * A ring filled to `fill` (0–100) of its circle. It only draws what it is given and is hidden from screen readers:
 * the sentence beside it carries the meaning. "unknown" draws a dashed empty ring.
 */
export function ProgressRing({ fill, tone, size = 'small', children }: { readonly fill: number; readonly tone: ProgressTone; readonly size?: 'small' | 'medium'; readonly children?: ReactNode }) {
  const value = tone === 'unknown' ? 0 : clampFill(fill);
  return <span className={`kairos-progress-ring kairos-progress-ring--${size}`} data-tone={tone} aria-hidden="true">
    <svg viewBox="0 0 120 120" focusable="false">
      <circle className="kairos-progress-ring__track" cx="60" cy="60" r="50" pathLength={100} fill="none" strokeWidth={12} strokeDasharray={tone === 'unknown' ? '4 4' : undefined} />
      {value > 0 ? <circle className="kairos-progress-ring__value" cx="60" cy="60" r="50" pathLength={100} fill="none" strokeWidth={12} strokeDasharray={`${value} 100`} transform="rotate(-90 60 60)" /> : null}
    </svg>
    {children !== undefined ? <span className="kairos-progress-ring__mark">{children}</span> : null}
  </span>;
}
