import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { KairosDatabase } from '../data/database';
import type { TradeSource } from '../domain/trades';
import type { JournalHistoryEntry } from '../application/journal';
import { updateOpenManualTrade } from '../application/trades/updateOpenManualTrade';
import { prepareManualTradeExecutionDetails, type ManualExecutionRow, type ManualFeeRow } from '../application/trades/manualTradeExecutionDraft';
import { JournalPriceCurrencyField } from '../features/journal/JournalPriceCurrencyField';
import { JournalClosedTradeGuidance } from '../features/journal/JournalClosedTradeGuidance';
import { PRICE_CURRENCY_INPUT_ERROR } from '../application/trades/priceCurrencyInput';
import { JournalExecutionFields } from '../features/journal/JournalExecutionFields';
import './journalOpenTradeUpdate.css';

interface Props {
  readonly entry: JournalHistoryEntry;
  readonly db: KairosDatabase;
  readonly onCommitted: () => Promise<void>;
  /** P35.2: which trade sources this control may update. Defaults to `['manual']`, so the Journal is unchanged; the Practice route names `['paper']`. */
  readonly allowedSources?: readonly TradeSource[];
}

export function JournalOpenTradeUpdate({ entry, db, onCommitted, allowedSources = ['manual'] }: Props) {
  const [snapshot, setSnapshot] = useState<JournalHistoryEntry | null>(null);
  const [executions, setExecutions] = useState<readonly ManualExecutionRow[]>([]);
  const [fees, setFees] = useState<readonly ManualFeeRow[]>([]);
  const [status, setStatus] = useState<'open' | 'closed'>('open');
  const [closedAt, setClosedAt] = useState('');
  const [grossPnlCurrency, setGrossPnlCurrency] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const [discard, setDiscard] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => { if (snapshot) panelRef.current?.focus(); }, [snapshot]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  function clear() {
    setSnapshot(null); setExecutions([]); setFees([]); setStatus('open'); setClosedAt(''); setGrossPnlCurrency(''); setError(null); setDiscard(false);
    triggerRef.current?.focus();
  }
  function cancel() {
    if (executions.length || fees.length || status !== 'open' || closedAt || (!snapshot?.trade.grossPnlCurrency && grossPnlCurrency.trim())) setDiscard(true);
    else clear();
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (isSaving || !snapshot) return;
    setError(null);
    const prepared = prepareManualTradeExecutionDetails({
      symbol: snapshot.trade.symbol, marketType: snapshot.trade.marketType, side: snapshot.trade.side,
      openedAt: snapshot.trade.openedAt, status, closedAt: status === 'closed' ? closedAt : null,
    }, executions, fees);
    if (!prepared.ok) { setError({ field: prepared.field, message: prepared.message }); return; }
    setIsSaving(true);
    const result = await updateOpenManualTrade(db, {
      expected: snapshot, grossPnlCurrency, status, closedAt: prepared.input.closedAt ?? null,
      executions: prepared.input.executions ?? [], fees: prepared.input.fees ?? [], allowedSources,
    });
    setIsSaving(false);
    if (!result.ok) {
      const field = result.type === 'validation-error' ? result.field : undefined;
      const message = result.type === 'update-conflict' ? 'This saved trade changed or can no longer be updated. Your new rows are kept. Cancel and reopen it to review the latest facts.'
        : result.type === 'storage-error' ? 'Kairos could not save the update. Your new rows are kept so you can retry.'
        : result.reason === 'no-new-facts' ? 'Add a new entry, exit, fee or P&L currency, or choose Closed.'
        : result.reason === 'close-before-open' ? 'Closed date and time must be after the opened date and time.'
        : field === 'grossPnlCurrency' ? (result.reason === 'invalid-pnl-currency' ? PRICE_CURRENCY_INPUT_ERROR : 'The recorded price currency cannot be changed here. Leave an unknown currency blank.')
        : field?.startsWith('executions.') ? 'Each new entry or exit needs a positive price, positive quantity and valid time.'
        : field?.startsWith('fees.') ? 'Each new fee needs a positive amount and its recorded currency.'
        : 'Add a valid closed date and time.';
      setError({ field, message }); return;
    }
    clear();
    await onCommitted();
  }

  if (!allowedSources.includes(entry.trade.source)) return null;
  return <div className="kairos-open-update">
    {!snapshot && entry.trade.status === 'open' ? <button ref={triggerRef} type="button" className="kairos-open-update__trigger" onClick={() => { setSnapshot(entry); setGrossPnlCurrency(entry.trade.grossPnlCurrency ?? ''); }}>Update trade</button> : null}
    {snapshot ? <div ref={panelRef} tabIndex={-1} role="region" aria-label={`Update ${snapshot.trade.symbol}`} className="kairos-open-update__panel">
      <h3>Update {snapshot.trade.symbol}</h3>
      <p>Add new fills to this saved trade. Recorded entries, exits and the trade plan stay intact.</p>
      <details className="kairos-open-update__recorded">
        <summary>Recorded fills · {snapshot.executions.length}</summary>
        {snapshot.executions.length ? <ul>{snapshot.executions.map(e => <li key={e.id}>
          <strong>{e.type === 'entry' ? 'Entry' : 'Exit'}</strong> · {e.quantity} @ {e.price}<br/>
          <time dateTime={e.executedAt}>{new Date(e.executedAt).toLocaleString()}</time>
        </li>)}</ul> : <p>No recorded fills yet.</p>}
      </details>
      <form onSubmit={submit} noValidate aria-label={`Update ${snapshot.trade.symbol} form`}>
        {error ? <p ref={errorRef} tabIndex={-1} role="alert" className="kairos-open-update__error">{error.message}</p> : null}
        <JournalPriceCurrencyField value={grossPnlCurrency} onChange={value => { setGrossPnlCurrency(value); setError(null); }} disabled={isSaving} recorded={Boolean(snapshot.trade.grossPnlCurrency)} error={error?.field === 'grossPnlCurrency' ? error.message : undefined} />
        <JournalExecutionFields executions={executions} fees={fees} onExecutionsChange={setExecutions} onFeesChange={setFees} canAddExecution disabled={isSaving} errorField={error?.field}/>
        <fieldset className="kairos-trade-form__section" disabled={isSaving}>
          <legend>After this update</legend>
          <label className="kairos-field" htmlFor={`${id}-status`}><span>Trade status</span>
            <select id={`${id}-status`} value={status} onChange={e => setStatus(e.target.value as 'open' | 'closed')}>
              <option value="open">Keep open</option><option value="closed">Closed</option>
            </select>
          </label>
          {status === 'closed' ? <label className="kairos-field" htmlFor={`${id}-closed`}><span>Closed date &amp; time</span>
            <input id={`${id}-closed`} type="datetime-local" value={closedAt} onChange={e => setClosedAt(e.target.value)} aria-invalid={error?.field === 'trade' || undefined}/>
          </label> : null}
          <p className="kairos-executions__hint">Status changes when you save. A complete result needs all actual entries and exits.</p>
        </fieldset>
        <JournalClosedTradeGuidance status={status} types={[...snapshot.executions, ...executions].map(row => row.type)} />
        <div className="kairos-open-update__actions">
          <button type="submit" className="kairos-trade-form__submit" disabled={isSaving}>{isSaving ? 'Saving…' : 'Save update'}</button>
          <button type="button" disabled={isSaving} onClick={cancel}>Cancel</button>
        </div>
        {discard ? <div className="kairos-open-update__discard" role="group" aria-label="Discard unsaved update">
          <p>Discard these unsaved additions?</p>
          <button type="button" onClick={clear}>Discard additions</button>
          <button type="button" onClick={() => setDiscard(false)}>Keep editing</button>
        </div> : null}
      </form>
    </div> : null}
  </div>;
}
