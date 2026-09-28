import { useState, type FormEvent } from 'react';
import { summarizeTradeReview, type SaveTradeDisciplineInput, type SaveTradeDisciplineResult } from '../../application/discipline';
import type { JournalHistoryScope } from '../../application/journal';
import { Button, Field, Sheet } from '../../design-system/primitives';
import { KAIROS_DISCIPLINE_NOTE_MAX_LENGTH, type DisciplineListItem, type TradeDisciplineRecord } from '../../domain/discipline';
import './tradeDisciplineControls.css';

export interface TradeReviewControlProps {
  readonly symbol: string;
  readonly tradeId: string;
  /** Which trades the page may write for; the host sets it. */
  readonly scope: JournalHistoryScope;
  /** The current review and mistake lists. */
  readonly reviewItems: readonly DisciplineListItem[];
  readonly mistakeItems: readonly DisciplineListItem[];
  readonly record: TradeDisciplineRecord | null;
  /** The host binds the database; this component never touches storage. */
  readonly save: (input: SaveTradeDisciplineInput) => Promise<SaveTradeDisciplineResult>;
  readonly onSaved: (record: TradeDisciplineRecord) => void;
}

interface Row { readonly itemId: string; readonly label: string; readonly ticked: boolean; }

/** A reviewed trade keeps the questions it was answered with; otherwise the current list, all empty. */
function reviewRows(items: readonly DisciplineListItem[], record: TradeDisciplineRecord | null): Row[] {
  if (record !== null && record.reviewedAt !== null && record.postTradeReview.length > 0) {
    return record.postTradeReview.map(answer => ({ itemId: answer.itemId, label: answer.label, ticked: answer.answer === 'yes' }));
  }
  return items.map(item => ({ itemId: item.id, label: item.label, ticked: false }));
}

/** Every current mistake, ticked when saved; saved mistakes no longer in the list follow, ticked, so a saved answer never silently disappears. */
function mistakeRows(items: readonly DisciplineListItem[], record: TradeDisciplineRecord | null): Row[] {
  const saved = new Map((record?.reviewedAt ? record.mistakes : []).map(mark => [mark.itemId, mark.label]));
  const current = items.map(item => ({ itemId: item.id, label: saved.get(item.id) ?? item.label, ticked: saved.has(item.id) }));
  const known = new Set(items.map(item => item.id));
  const removed = [...saved].filter(([itemId]) => !known.has(itemId)).map(([itemId, label]) => ({ itemId, label, ticked: true }));
  return [...current, ...removed];
}

function cardText(record: TradeDisciplineRecord | null): { readonly state: string; readonly label: string; readonly reviewed: boolean } {
  const summary = summarizeTradeReview(record);
  if (!summary.reviewed) return { state: 'Not reviewed yet', label: 'After the trade: not reviewed yet', reviewed: false };
  if (summary.mistakeCount === 0) return { state: 'Reviewed', label: 'After the trade: reviewed, no mistakes', reviewed: true };
  const mistakes = summary.mistakeCount === 1 ? '1 mistake' : `${summary.mistakeCount} mistakes`;
  return { state: `Reviewed · ${mistakes}`, label: `After the trade: reviewed, ${mistakes}`, reviewed: true };
}

/** "After the trade" on a closed card: what went well, any mistakes and a short note, saved in one write. */
export function TradeReviewControl({ symbol, tradeId, scope, reviewItems, mistakeItems, record, save, onSaved }: TradeReviewControlProps) {
  const [open, setOpen] = useState(false);
  const [review, setReview] = useState<Row[]>([]);
  const [mistakes, setMistakes] = useState<Row[]>([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const text = cardText(record);

  function openSheet(): void {
    setReview(reviewRows(reviewItems, record));
    setMistakes(mistakeRows(mistakeItems, record));
    setNote(record?.reviewedAt ? record.note : '');
    setFailure(null);
    setOpen(true);
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setFailure(null);
    const result = await save({
      tradeId: tradeId as SaveTradeDisciplineInput['tradeId'], scope, half: 'review',
      answers: review.map(row => ({ itemId: row.itemId, answer: row.ticked ? 'yes' : 'no' })),
      mistakeIds: mistakes.filter(row => row.ticked).map(row => row.itemId),
      note,
    }).catch(() => null);
    setSaving(false);
    if (result === null || !result.ok) {
      setFailure(result !== null && !result.ok && result.reason === 'note-too-long'
        ? `Keep your note under ${KAIROS_DISCIPLINE_NOTE_MAX_LENGTH} characters.`
        : 'Kairos could not save your review. Your answers are kept so you can try again.');
      return;
    }
    setOpen(false);
    onSaved(result.record);
  }

  const toggle = (setRows: typeof setReview, index: number) => setRows(current => current.map((row, at) => (at === index ? { ...row, ticked: !row.ticked } : row)));

  return <>
    <Button variant="secondary" size="sm" className="kairos-discipline-control" onClick={openSheet} aria-label={text.label}>
      {text.reviewed ? <span className="kairos-discipline-control__mark" aria-hidden="true">✓</span> : null}
      <span className="kairos-discipline-control__title">After the trade</span>
      <span className="kairos-discipline-control__state">{text.state}</span>
    </Button>
    <Sheet open={open} title={`After the trade: ${symbol}`} onClose={() => setOpen(false)}>
      <form className="kairos-discipline-sheet" onSubmit={event => { void submit(event); }} noValidate>
        <fieldset>
          <legend>What went well?</legend>
          {review.map((row, index) => <label className="kairos-discipline-check" key={row.itemId}>
            <input type="checkbox" checked={row.ticked} onChange={() => toggle(setReview, index)} /> <span>{row.label}</span>
          </label>)}
        </fieldset>
        <fieldset>
          <legend>Any mistakes?</legend>
          {mistakes.map((row, index) => <label className="kairos-discipline-check" key={row.itemId}>
            <input type="checkbox" checked={row.ticked} onChange={() => toggle(setMistakes, index)} /> <span>{row.label}</span>
          </label>)}
        </fieldset>
        <Field label="Note" hint={`Optional. Up to ${KAIROS_DISCIPLINE_NOTE_MAX_LENGTH} characters.`}>
          {control => <textarea {...control} rows={3} maxLength={KAIROS_DISCIPLINE_NOTE_MAX_LENGTH} value={note} onChange={event => setNote(event.target.value)} />}
        </Field>
        {failure ? <p role="alert">{failure}</p> : null}
        <Button type="submit" busy={saving}>{saving ? 'Saving…' : 'Save review'}</Button>
      </form>
    </Sheet>
  </>;
}
