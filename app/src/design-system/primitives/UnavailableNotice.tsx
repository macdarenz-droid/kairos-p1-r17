import { useEffect } from 'react';
import { ErrorState } from './ErrorState';
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
  return <ErrorState tone="unavailable" className="kairos-unavailable" message={<><strong>Unavailable</strong> · {message}</>}
    retryLabel={retryLabel} onRetry={onRetry} busy={busy} live={live} />;
}
