import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { JournalHistoryEntry } from '../../application/journal';
import type { SaveTradeNoteResult } from '../../application/trades/saveTradeNote';
import { TRADE_NOTE_MAX_LENGTH } from '../../domain/trades';
import { Button, Card, Field } from '../../design-system/primitives';

/** What a note's length is said against, as the save counts it: characters of the trimmed text. */
const noteLength = (text: string): number => Array.from(text.trim()).length;
const LIMIT_WORDS = TRADE_NOTE_MAX_LENGTH.toLocaleString();
export const NOTE_TOO_LONG = `A note can be up to ${LIMIT_WORDS} characters.`;

/** U15 (D265): the note's text area with its counter ("12 of 2,000 characters"), on the trade's page and in Edit. */
export function TradeNoteField({ id, label, value, onChange, error, disabled = false }: {
  readonly id: string; readonly label: string; readonly value: string; readonly onChange: (value: string) => void; readonly error?: string; readonly disabled?: boolean;
}) {
  const length = noteLength(value);
  return <Field label={label} id={id} wide error={error} invalid={length > TRADE_NOTE_MAX_LENGTH}
    hint={`Optional. ${length.toLocaleString()} of ${LIMIT_WORDS} characters.`}>
    {control => <textarea {...control} name="note" rows={4} value={value} onChange={event => onChange(event.target.value)} disabled={disabled} />}
  </Field>;
}

type Feedback = Readonly<{ message: string; stale: boolean }> | null;

/**
 * U15 (D265): "Notes" on a trade's page, for every trade of the list, Replay's included: the note and Save. A note
 * saved elsewhere (Edit, another tab) shows here unless you are typing one; then Save is checked against the trade as
 * it was when that note was last shown, so a note saved elsewhere meanwhile is never overwritten: Save says so and
 * offers the new version. A change to the rest of the trade does not stop the note.
 */
export function TradeNotesCard({ entry, save, onSaved, onLoadNewVersion }: {
  readonly entry: JournalHistoryEntry;
  /** Saves the note against `basis`, the trade as it was when the note being typed was last shown saved. */
  readonly save: (note: string, basis: JournalHistoryEntry) => Promise<SaveTradeNoteResult>;
  readonly onSaved: (notice: string) => Promise<void>;
  /** Reads the trade again; resolves with what it read (null: gone, undefined: the read failed). */
  readonly onLoadNewVersion: () => Promise<JournalHistoryEntry | null | undefined>;
}) {
  const saved = entry.trade.note ?? '';
  const [text, setText] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const shown = useRef(saved);
  const basis = useRef(entry);
  const typed = useRef(text);
  typed.current = text;
  const area = useRef<HTMLDivElement>(null);
  const feedbackRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    // The trade was read again. While nothing is being typed, or its saved note is the one typing started from, the
    // new read is what a save is checked against; a note saved elsewhere meanwhile keeps the old one, so Save says so.
    const typing = typed.current !== shown.current;
    if (!typing || (entry.trade.note ?? '') === (basis.current.trade.note ?? '')) basis.current = entry;
    // Show a newly saved note, unless something else is being typed.
    setText(current => (current === shown.current ? saved : current));
    shown.current = saved;
  }, [entry, saved]);
  useEffect(() => { if (feedback !== null) feedbackRef.current?.focus(); }, [feedback]);

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (busy) return;
    if (noteLength(text) > TRADE_NOTE_MAX_LENGTH) { setFeedback({ message: NOTE_TOO_LONG, stale: false }); return; }
    setBusy(true);
    setFeedback(null);
    const result = await save(text, basis.current).catch((): SaveTradeNoteResult => ({ ok: false, type: 'storage-error', reason: 'trade-save-failed' }));
    setBusy(false);
    if (result.ok) {
      setText(result.note ?? '');
      shown.current = result.note ?? '';
      await onSaved(result.note === null ? 'Note removed.' : 'Note saved.');
      return;
    }
    setFeedback(result.type === 'validation-error' ? { message: NOTE_TOO_LONG, stale: false }
      : result.type === 'update-conflict' && result.reason === 'trade-changed' ? { message: "This trade changed in another tab. Your note isn't saved.", stale: true }
      : result.type === 'update-conflict' ? { message: "This trade isn't in your journal any more. Your note isn't saved.", stale: false }
      : { message: 'Kairos could not save your note. What you typed is kept so you can try again.', stale: false });
  }

  async function loadNewVersion(): Promise<void> {
    const next = await onLoadNewVersion();
    if (!next) return;
    // The saved note replaces what was typed, and focus goes to the note (its button is gone).
    basis.current = next;
    shown.current = next.trade.note ?? '';
    setText(shown.current);
    setFeedback(null);
    area.current?.querySelector('textarea')?.focus();
  }

  return <Card as="section" className="kairos-trade-page__part kairos-trade-notes" aria-labelledby="kairos-trade-page-notes">
    <h2 id="kairos-trade-page-notes">Notes</h2>
    <form onSubmit={submit} noValidate>
      <div ref={area}><TradeNoteField id="kairos-trade-page-note" label="Your note about this trade" value={text} onChange={value => { setText(value); setFeedback(null); }} disabled={busy} /></div>
      {feedback !== null ? <p ref={feedbackRef} tabIndex={-1} role="alert" className="kairos-trade-notes__error">{feedback.message}
        {feedback.stale ? <> <Button variant="secondary" size="sm" onClick={() => { void loadNewVersion(); }}>Load the new version</Button></> : null}</p> : null}
      <Button type="submit" variant="secondary" size="sm" busy={busy}>{busy ? 'Saving…' : 'Save note'}</Button>
    </form>
  </Card>;
}
