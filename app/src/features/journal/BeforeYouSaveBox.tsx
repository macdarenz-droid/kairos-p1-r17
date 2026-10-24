import { type RefObject, useRef } from 'react';
import type { BeforeYouSaveNote } from '../../application/discipline/beforeYouSave';
import { BEFORE_SAVE_REASON_MAX_LENGTH } from '../../domain/discipline';
import { Button, Field } from '../../design-system/primitives';

interface BeforeYouSaveBoxProps {
  readonly idPrefix: string;
  readonly notes: readonly BeforeYouSaveNote[];
  /** The limits and news could not be read: only what the form knows is named, and this says so with "Try again". */
  readonly readsFailed: boolean;
  readonly retrying: boolean;
  /** Reads again; resolves once the result is on screen. */
  readonly onRetry: () => Promise<void>;
  readonly reason: string;
  readonly onReasonChange: (value: string) => void;
  readonly disabled: boolean;
  /** Where focus goes when "Try again" works and nothing is left to name: Save. */
  readonly afterRef: RefObject<HTMLButtonElement | null>;
}

/**
 * U12 (D242, D243): the calm "Before you save" box above Save. It names what applies, never blocks, and takes an optional
 * reason for saving anyway. Its live region stays mounted, so each change is heard once, politely. After "Try again"
 * works, focus goes to the reason field (or Save when the box closes); if it fails again, focus stays on the new "Try
 * again". It never falls to the page.
 */
export function BeforeYouSaveBox({ idPrefix, notes, readsFailed, retrying, onRetry, reason, onReasonChange, disabled, afterRef }: BeforeYouSaveBoxProps) {
  const reasonRef = useRef<HTMLTextAreaElement>(null);
  const retryRef = useRef<HTMLButtonElement>(null);
  // A "Try again" still on screen means it failed again; otherwise the reason field, or Save when the box closed.
  const retry = () => { void onRetry().then(() => (retryRef.current ?? reasonRef.current ?? afterRef.current)?.focus()); };

  const shown = notes.length > 0 || readsFailed;
  const titleId = `${idPrefix}-before-save-title`;
  return <div className={shown ? 'kairos-trade-form__section kairos-trade-form__before-save' : undefined} role={shown ? 'region' : undefined} aria-labelledby={shown ? titleId : undefined}>
    {shown ? <h2 id={titleId} className="kairos-trade-form__before-save-title">Before you save</h2> : null}
    <div aria-live="polite">
      {notes.length > 0 ? <ul className="kairos-trade-form__before-save-list">{notes.map(note => <li key={note.kind}>{note.text}</li>)}</ul> : null}
      {readsFailed ? <p className="kairos-trade-form__section-copy">Kairos could not check your limits and news.</p> : null}
    </div>
    {readsFailed ? <Button ref={retryRef} variant="secondary" size="sm" busy={retrying} onClick={retry}>Try again</Button> : null}
    {notes.length > 0 ? <Field label="You can still save. Why save anyway? (optional)" id={`${idPrefix}-save-anyway`} hint={`Up to ${BEFORE_SAVE_REASON_MAX_LENGTH} letters.`}>
      {control => <textarea {...control} ref={reasonRef} name="saveAnywayReason" rows={2} maxLength={BEFORE_SAVE_REASON_MAX_LENGTH} value={reason} disabled={disabled} onChange={event => onReasonChange(event.target.value)} />}
    </Field> : null}
  </div>;
}
