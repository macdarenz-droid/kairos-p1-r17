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
}

/** U1: the one "Unavailable · Try again" box for anything Kairos gets online. It never hides what is already saved. */
export function UnavailableNotice({ message, retryLabel, onRetry, busy = false, live = true }: UnavailableNoticeProps) {
  return <div className="kairos-unavailable" role={live ? 'alert' : undefined}>
    <p className="kairos-unavailable__text"><strong>Unavailable</strong> · {message}</p>
    {retryLabel !== null && onRetry !== undefined ? <Button variant="secondary" size="sm" busy={busy} onClick={onRetry}>{retryLabel}</Button> : null}
  </div>;
}
