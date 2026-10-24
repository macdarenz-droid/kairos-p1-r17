import { useId, useRef, useState } from 'react';
import { Button } from '../../design-system/primitives';
import './errorDetails.css';

/** The browser's clipboard, as far as Kairos uses it; null where there is none. */
export interface ErrorDetailsClipboard { writeText(text: string): Promise<void> }

export const browserClipboard = (): ErrorDetailsClipboard | null =>
  typeof navigator !== 'undefined' && navigator.clipboard !== undefined && typeof navigator.clipboard.writeText === 'function' ? navigator.clipboard : null;

/**
 * T-054e (D230): "Copy error details" on the crash screen and the page error screen. It copies the text and says
 * "Copied."; without a clipboard (or when the browser refuses), it shows the text in a read-only box with "Select all",
 * so it can still be copied by hand.
 */
export function CopyErrorDetails({ details, clipboard = browserClipboard() }: {
  /** Made when the button is pressed, so the details include what happened up to then. */
  readonly details: () => string;
  readonly clipboard?: ErrorDetailsClipboard | null;
}) {
  const boxId = useId();
  const box = useRef<HTMLTextAreaElement>(null);
  const [state, setState] = useState<Readonly<{ kind: 'idle' }> | Readonly<{ kind: 'copied' | 'shown'; text: string }>>({ kind: 'idle' });

  async function copy(): Promise<void> {
    const text = details();
    if (clipboard !== null) {
      try {
        await clipboard.writeText(text);
        setState({ kind: 'copied', text });
        return;
      } catch {
        // Refused (no permission, or the page is not focused): the text is shown to copy by hand.
      }
    }
    setState({ kind: 'shown', text });
  }

  return <div className="kairos-error-details">
    <Button variant="secondary" onClick={() => { void copy(); }}>Copy error details</Button>
    {/* The text is always shown, so the trader sees exactly what they send (a browser's own error words could quote data). */}
    {state.kind !== 'idle' ? <>
      <p role="status">{state.kind === 'copied' ? 'Copied. This is the text:' : 'Kairos could not copy. Select the text below and copy it.'}</p>
      <label htmlFor={boxId}>Error details</label>
      <textarea id={boxId} ref={box} readOnly rows={8} value={state.text} />
      <Button variant="secondary" onClick={() => { box.current?.focus(); box.current?.select(); }}>Select all</Button>
    </> : null}
  </div>;
}
