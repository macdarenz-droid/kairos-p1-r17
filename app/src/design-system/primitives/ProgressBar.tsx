import type { ProgressTone } from './ProgressRing';
import './kit.css';

/** A bar filled to `fill` (0–100) toward a limit. It only draws and is hidden from screen readers; the sentence beside it speaks. */
export function ProgressBar({ fill, tone }: { readonly fill: number; readonly tone: ProgressTone }) {
  const value = tone === 'unknown' || !Number.isFinite(fill) ? 0 : Math.min(100, Math.max(0, Math.round(fill)));
  return <span className="kairos-progress-bar" data-tone={tone} aria-hidden="true">
    <span className="kairos-progress-bar__value" style={{ width: `${value}%` }} />
  </span>;
}
