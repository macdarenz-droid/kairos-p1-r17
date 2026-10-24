import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Icon } from '../icons/Icon';
import { Button } from './Button';
import './kit.css';

export interface ErrorStateProps {
  readonly message: ReactNode;
  /** Default "Try again"; null hides the button (a retry cannot help). */
  readonly retryLabel?: string | null;
  readonly onRetry?: () => void;
  readonly busy?: boolean;
  /** false: not a live region, for a screen whose own status line already announces the answer. */
  readonly live?: boolean;
  readonly tone?: 'error' | 'unavailable';
  readonly className?: string;
}

/** Something could not be done: what happened, in plain words, and "Try again" when a retry can help. */
export function ErrorState({ message, retryLabel = 'Try again', onRetry, busy = false, live = true, tone = 'error', className }: ErrorStateProps) {
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
  return <div className={['kairos-error-state', className].filter(Boolean).join(' ')} data-tone={tone} role={live ? 'alert' : undefined} ref={box} tabIndex={-1}>
    <Icon name="alert" size={20} className="kairos-error-state__icon" />
    <p className="kairos-error-state__message">{message}</p>
    {retryLabel !== null && onRetry !== undefined ? <Button ref={button} variant="secondary" size="sm" busy={busy} onClick={onRetry}
      onFocus={() => { buttonHadFocus.current = true; }}
      onBlur={event => { if (event.relatedTarget !== null) buttonHadFocus.current = false; }}>{retryLabel}</Button> : null}
  </div>;
}
