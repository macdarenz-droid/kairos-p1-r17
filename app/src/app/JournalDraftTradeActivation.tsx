import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import type { JournalHistoryEntry } from '../application/journal';
import { openDraftTrade } from '../application/trades/openDraftTrade';
import { prepareManualTradeExecutionDetails, type ManualExecutionRow, type ManualFeeRow } from '../application/trades/manualTradeExecutionDraft';
import { PRICE_CURRENCY_INPUT_ERROR } from '../application/trades/priceCurrencyInput';
import type { KairosDatabase } from '../data/database';
import type { TradeSource } from '../domain/trades';
import { JournalExecutionFields } from '../features/journal/JournalExecutionFields';
import { JournalPriceCurrencyField } from '../features/journal/JournalPriceCurrencyField';
import './journalDraftTradeActivation.css';

interface Props {
  readonly entry: JournalHistoryEntry;
  readonly db: KairosDatabase;
  /** Called after the draft became open, with the notice the list should show. */
  readonly onOpened: (notice: string) => Promise<void>;
  /** P35.2: which trade sources this control may open. Defaults to `['manual']`, so the Journal is unchanged; the Practice route names `['paper']`. */
  readonly allowedSources?: readonly TradeSource[];
}

const moment = (iso: string): string => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;

/** P31.2: opens one saved manual draft through the P31.1 command; the released P10 fields collect the opened moment, first fills, fees and currency. */
export function JournalDraftTradeActivation({ entry, db, onOpened, allowedSources = ['manual'] }: Props) {
  const [snapshot, setSnapshot] = useState<JournalHistoryEntry | null>(null);
  const [openedAt, setOpenedAt] = useState('');
  const [executions, setExecutions] = useState<readonly ManualExecutionRow[]>([]);
  const [fees, setFees] = useState<readonly ManualFeeRow[]>([]);
  const [grossPnlCurrency, setGrossPnlCurrency] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<{ field?: string; message: string } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLParagraphElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => { if (snapshot) panelRef.current?.focus(); }, [snapshot]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  if (!allowedSources.includes(entry.trade.source) || entry.trade.status !== 'draft') return null;

  function clear() {
    setSnapshot(null); setOpenedAt(''); setExecutions([]); setFees([]); setGrossPnlCurrency(''); setError(null);
    triggerRef.current?.focus();
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault(); if (isSaving || !snapshot) return;
    setError(null);
    if (!openedAt.trim()) { setError({ field: 'trade', message: 'Add the opened date and time to open this trade.' }); return; }
    const prepared = prepareManualTradeExecutionDetails({ symbol: snapshot.trade.symbol, marketType: snapshot.trade.marketType, side: snapshot.trade.side, status: 'open', openedAt, closedAt: null }, executions, fees);
    if (!prepared.ok) { setError({ field: prepared.field, message: prepared.message }); return; }
    if (!prepared.input.openedAt) { setError({ field: 'trade', message: 'Add a valid opened date and time.' }); return; }
    setIsSaving(true);
    const result = await openDraftTrade(db, { expected: snapshot, openedAt: prepared.input.openedAt, grossPnlCurrency, executions: prepared.input.executions ?? [], fees: prepared.input.fees ?? [], allowedSources });
    setIsSaving(false);
    if (!result.ok) {
      const field = result.type === 'validation-error' ? result.field : undefined;
      const message = result.type === 'update-conflict'
        ? (result.reason === 'trade-changed' ? 'This draft changed since you opened it. Refresh the history and try again.' : result.reason === 'trade-not-draft-manual' ? 'This trade is no longer a draft. Refresh the history.' : 'Kairos could not assign new ids. Nothing was changed.')
        : result.type === 'storage-error' ? 'Kairos could not open this trade. Your entries are kept so you can retry.'
        : field === 'grossPnlCurrency' ? PRICE_CURRENCY_INPUT_ERROR
        : field?.startsWith('executions.') ? 'Each entry or exit needs a positive price, positive quantity and valid time.'
        : field?.startsWith('fees.') ? 'Each fee needs a positive amount and its recorded currency.'
        : 'Add a valid opened date and time.';
      setError({ field, message }); return;
    }
    const opened = prepared.input.openedAt;
    clear();
    await onOpened(`${snapshot.trade.symbol} is now open from ${moment(opened)}.`);
  }

  return <div className="kairos-draft-open" data-draft-open={snapshot ? 'editing' : 'idle'}>
    {!snapshot ? <button ref={triggerRef} type="button" className="kairos-draft-open__trigger" onClick={() => setSnapshot(entry)}>Open this trade</button> : null}
    {snapshot ? <div ref={panelRef} tabIndex={-1} role="region" aria-label={`Open ${snapshot.trade.symbol}`} className="kairos-draft-open__panel">
      <h3>Open {snapshot.trade.symbol}</h3>
      <p>Record when this planned trade was opened and, if you have them, its first fills. Your plan stays as you wrote it.</p>
      <form onSubmit={submit} noValidate aria-label={`Open ${snapshot.trade.symbol} form`}>
        {error ? <p ref={errorRef} tabIndex={-1} role="alert" className="kairos-draft-open__error">{error.message}</p> : null}
        <fieldset className="kairos-trade-form__section" disabled={isSaving}>
          <legend>Opened</legend>
          <label className="kairos-field" htmlFor={`${id}-opened`}><span>Opened date &amp; time <strong>Required</strong></span>
            <input id={`${id}-opened`} type="datetime-local" value={openedAt} onChange={e => { setOpenedAt(e.target.value); setError(null); }} aria-invalid={error?.field === 'trade' || undefined} />
          </label>
        </fieldset>
        <JournalPriceCurrencyField value={grossPnlCurrency} onChange={value => { setGrossPnlCurrency(value); setError(null); }} disabled={isSaving} recorded={Boolean(snapshot.trade.grossPnlCurrency)} error={error?.field === 'grossPnlCurrency' ? error.message : undefined} />
        <JournalExecutionFields executions={executions} fees={fees} onExecutionsChange={rows => { setExecutions(rows); setError(null); }} onFeesChange={rows => { setFees(rows); setError(null); }} canAddExecution disabled={isSaving} errorField={error?.field} />
        <div className="kairos-draft-open__actions">
          <button type="submit" className="kairos-trade-form__submit" disabled={isSaving}>{isSaving ? 'Opening…' : 'Save opening'}</button>
          <button type="button" disabled={isSaving} onClick={clear}>Cancel</button>
        </div>
      </form>
    </div> : null}
  </div>;
}
