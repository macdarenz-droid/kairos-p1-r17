import { type FormEvent, useEffect, useId, useRef, useState } from 'react';
import type { JournalHistoryEntry } from '../../application/journal';
import type { UpdateTradeExecutionInput, UpdateTradeExecutionResult } from '../../application/trades';
import { Button, Field } from '../../design-system/primitives';
import './entriesAndExitsEditor.css';

interface EntriesAndExitsEditorProps {
  readonly entry: JournalHistoryEntry;
  /** The host binds the database; this component never touches storage. */
  readonly save: (input: UpdateTradeExecutionInput) => Promise<UpdateTradeExecutionResult>;
  readonly onSaved: () => Promise<void>;
}

type Editing =
  | { readonly kind: 'execution'; readonly key: string; readonly label: string; readonly expected: JournalHistoryEntry; readonly id: JournalHistoryEntry['executions'][number]['id']; readonly savedTime: string; readonly price: string; readonly quantity: string; readonly time: string }
  | { readonly kind: 'fee'; readonly key: string; readonly label: string; readonly expected: JournalHistoryEntry; readonly id: JournalHistoryEntry['fees'][number]['id']; readonly amount: string; readonly currency: string };

const timeFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : timeFormat.format(date);
}

const pad = (value: number): string => String(value).padStart(2, '0');

/** The saved time in device time, in the `datetime-local` format with seconds. */
function localInputValue(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function failureMessage(result: Extract<UpdateTradeExecutionResult, { ok: false }>): string {
  if (result.type === 'update-conflict') return 'This trade changed since you opened it. Press Cancel and try again.';
  if (result.type === 'storage-error') return 'Kairos could not save the change. Your edits are kept so you can try again.';
  switch (result.field) {
    case 'execution.price': return 'Enter a price above 0.';
    case 'execution.quantity': return 'Enter a quantity above 0.';
    case 'execution.executedAt': return 'Enter a valid date and time.';
    case 'fee.amount': return 'Enter a fee above 0.';
    case 'fee.currency': return 'Enter the fee currency, such as USDT.';
    default: return 'Nothing changed. Change a value or press Cancel.';
  }
}

/** "Your entries and exits" on a saved trade card: each saved entry, exit and fee with an Edit form. */
export function EntriesAndExitsEditor({ entry, save, onSaved }: EntriesAndExitsEditorProps) {
  const listId = useId();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const editButtons = useRef(new Map<string, HTMLButtonElement>());
  const firstField = useRef<HTMLInputElement>(null);
  const returnFocusTo = useRef<string | null>(null);

  useEffect(() => { if (editing) firstField.current?.focus(); }, [editing?.key]);
  useEffect(() => {
    if (editing || !returnFocusTo.current) return;
    editButtons.current.get(returnFocusTo.current)?.focus();
    returnFocusTo.current = null;
  }, [editing]);

  if (entry.executions.length === 0 && entry.fees.length === 0) return null;

  function close(focusKey: string | null): void {
    returnFocusTo.current = focusKey;
    setEditing(null);
    setMessage(null);
  }

  function change(patch: Partial<Record<'price' | 'quantity' | 'time' | 'amount' | 'currency', string>>): void {
    setEditing(current => current ? { ...current, ...patch } as Editing : current);
    setMessage(null);
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!editing || isSaving) return;
    let input: UpdateTradeExecutionInput;
    if (editing.kind === 'execution') {
      // An untouched time keeps the saved value exactly, including imported seconds and milliseconds.
      const unchanged = editing.time === localInputValue(editing.savedTime);
      const parsed = new Date(editing.time);
      const executedAt = unchanged ? editing.savedTime : Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString();
      input = { expected: editing.expected, execution: { id: editing.id, price: editing.price, quantity: editing.quantity, executedAt } };
    } else {
      input = { expected: editing.expected, fee: { id: editing.id, amount: editing.amount, currency: editing.currency } };
    }
    setIsSaving(true);
    const result = await save(input);
    setIsSaving(false);
    if (!result.ok) { setMessage(failureMessage(result)); return; }
    close(null);
    await onSaved();
  }

  function form(current: Editing) {
    return <form className="kairos-entries-exits__form" aria-label={`Edit ${current.label.toLowerCase()}`} onSubmit={submit} noValidate>
      {message ? <p className="kairos-entries-exits__error" role="alert">{message}</p> : null}
      <fieldset className="kairos-entries-exits__fields" disabled={isSaving}>
        {current.kind === 'execution' ? <>
          <Field label="Price" id={`${formId}-price`}>{control => <input {...control} ref={firstField} inputMode="decimal" value={current.price} onChange={event => change({ price: event.target.value })} />}</Field>
          <Field label="Quantity" id={`${formId}-quantity`}>{control => <input {...control} inputMode="decimal" value={current.quantity} onChange={event => change({ quantity: event.target.value })} />}</Field>
          <Field label="Date & time" id={`${formId}-time`}>{control => <input {...control} type="datetime-local" step="1" value={current.time} onChange={event => change({ time: event.target.value })} />}</Field>
        </> : <>
          <Field label="Amount" id={`${formId}-amount`}>{control => <input {...control} ref={firstField} inputMode="decimal" value={current.amount} onChange={event => change({ amount: event.target.value })} />}</Field>
          <Field label="Currency" id={`${formId}-currency`}>{control => <input {...control} autoCapitalize="characters" value={current.currency} onChange={event => change({ currency: event.target.value })} />}</Field>
        </>}
        <div className="kairos-entries-exits__actions">
          <Button type="submit" size="sm" busy={isSaving}>{isSaving ? 'Saving…' : 'Save change'}</Button>
          <Button variant="ghost" size="sm" onClick={() => close(current.key)}>Cancel</Button>
        </div>
      </fieldset>
    </form>;
  }

  const editButton = (key: string, label: string, onEdit: () => void) =>
    <Button variant="ghost" size="sm" ref={(node: HTMLButtonElement | null) => { if (node) editButtons.current.set(key, node); else editButtons.current.delete(key); }}
      aria-label={`Edit ${label.toLowerCase()}`} disabled={editing !== null} onClick={onEdit}>Edit</Button>;

  return <div className="kairos-entries-exits">
    <button type="button" className="kairos-entries-exits__toggle" aria-expanded={open} aria-controls={listId} onClick={() => { setOpen(value => !value); close(null); }}>Your entries and exits</button>
    {open ? <div id={listId} className="kairos-entries-exits__body">
      {entry.executions.length > 0 ? <ol className="kairos-entries-exits__list">
        {entry.executions.map((row, index) => {
          const label = `${row.type === 'entry' ? 'Entry' : 'Exit'} ${index + 1}`;
          const key = `execution-${row.id}`;
          return <li key={row.id} className="kairos-entries-exits__row">
            {editing?.key === key ? form(editing) : <>
              <strong>{label}</strong>
              <span>{row.quantity} at {row.price}</span>
              <time dateTime={row.executedAt}>{formatTime(row.executedAt)}</time>
              {editButton(key, label, () => setEditing({ kind: 'execution', key, label, expected: entry, id: row.id, savedTime: row.executedAt, price: row.price, quantity: row.quantity, time: localInputValue(row.executedAt) }))}
            </>}
          </li>;
        })}
      </ol> : null}
      {entry.fees.length > 0 ? <ul className="kairos-entries-exits__list">
        {entry.fees.map((row, index) => {
          const label = `Fee ${index + 1}`;
          const key = `fee-${row.id}`;
          return <li key={row.id} className="kairos-entries-exits__row">
            {editing?.key === key ? form(editing) : <>
              <strong>{label}</strong>
              <span>{row.amount} {row.currency}</span>
              {editButton(key, label, () => setEditing({ kind: 'fee', key, label, expected: entry, id: row.id, amount: row.amount, currency: row.currency }))}
            </>}
          </li>;
        })}
      </ul> : null}
    </div> : null}
  </div>;
}
