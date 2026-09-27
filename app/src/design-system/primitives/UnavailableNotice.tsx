import { useEffect, useLayoutEffect, useRef } from 'react';
import { Button } from './Button';
import './primitives.css';

export interface UnavailableNoticeProps {
  /** One plain sentence, from the application's words (describeUnavailable). */
  readonly message: string;
  /** null hides the button: a retry cannot help. */
  readonly retryLabel: string | null;
  readonly onRetry?: () => void;
  readonly busy?: boolean;
  /** false: not a live region, for a screen whose own status line already announces the answer. */
  readonly live?: boolean;
  /** true: calls onRetry once each time the browser comes back online, while the box is shown (D166). */
  readonly retryWhenOnline?: boolean;
}

/** U1: the one "Unavailable · Try again" box for anything Kairos gets online. It never hides what is already saved. */
export function UnavailableNotice({ message, retryLabel, onRetry, busy = false, live = true, retryWhenOnline = false }: UnavailableNoticeProps) {
  useEffect(() => {
    if (!retryWhenOnline || onRetry === undefined) return;
    const online = () => onRetry();
    window.addEventListener('online', online);
    return () => window.removeEventListener('online', online);
  }, [retryWhenOnline, onRetry]);
  // A busy button is disabled, and a browser moves focus off a disabled button to the page (inside a sheet, Escape then
  // stops working). While busy, focus waits on the box; it goes back to the button when the button is enabled again.
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const buttonHadFocus = useRef(false);
  useLayoutEffect(() => {
    if (!buttonHadFocus.current) return;
    const active = document.activeElement;
    if (busy && (active === null || active === document.body)) box.current?.focus({ preventScroll: true });
    else if (!busy && active === box.current) button.current?.focus({ preventScroll: true });
  }, [busy]);
  return <div className="kairos-unavailable" role={live ? 'alert' : undefined} ref={box} tabIndex={-1}>
    <p className="kairos-unavailable__text"><strong>Unavailable</strong> · {message}</p>
    {retryLabel !== null && onRetry !== undefined ? <Button ref={button} variant="secondary" size="sm" busy={busy} onClick={onRetry}
      onFocus={() => { buttonHadFocus.current = true; }}
      onBlur={event => { if (event.relatedTarget !== null) buttonHadFocus.current = false; }}>{retryLabel}</Button> : null}
  </div>;
}
