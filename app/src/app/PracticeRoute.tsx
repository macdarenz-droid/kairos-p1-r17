import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { listJournalHistory, type JournalHistoryEntry } from '../application/journal';
import { savePracticeTrade } from '../application/practice';
import { createEmptyManualTradeDraft, prepareManualTradeSubmission, type ManualTradeDraft, type ManualTradeDraftRequiredField, type ManualTradeValidationField } from '../application/trades';
import { prepareManualTradeExecutionDetails, type ManualExecutionRow, type ManualFeeRow } from '../application/trades/manualTradeExecutionDraft';
import { PRICE_CURRENCY_INPUT_ERROR } from '../application/trades/priceCurrencyInput';
import { kairosDatabase, type KairosDatabase } from '../data/database';
import type { TradeStatus } from '../domain/trades';
import { JournalClosedTradeGuidance } from './JournalClosedTradeGuidance';
import { JournalExecutionFields } from './JournalExecutionFields';
import { JournalHistoryList } from './JournalHistoryList';
import { JournalPriceCurrencyField } from './JournalPriceCurrencyField';
import './journalRoute.css';
import './practiceRoute.css';

interface PracticeRouteProps {
  readonly db?: KairosDatabase;
}

type Feedback =
  | { readonly kind: 'error'; readonly field?: string; readonly message: string }
  | { readonly kind: 'success'; readonly message: string }
  | null;

const MARKET_OPTIONS = [['stock', 'Stocks'], ['forex', 'Forex'], ['crypto', 'Crypto'], ['futures', 'Futures'], ['options', 'Options'], ['other', 'Other']] as const;
const SIDE_OPTIONS = [['long', 'Long'], ['short', 'Short']] as const;
const STATUS_OPTIONS = [['draft', 'Draft'], ['open', 'Open'], ['closed', 'Closed'], ['cancelled', 'Cancelled']] as const;

function requiredSelectionMessage(field: ManualTradeDraftRequiredField): string {
  if (field === 'marketType') return 'Choose a market.';
  if (field === 'side') return 'Choose long or short.';
  return 'Choose a trade status.';
}

function validationMessage(field: ManualTradeValidationField, reason: string): string {
  if (field === 'grossPnlCurrency') return PRICE_CURRENCY_INPUT_ERROR;
  if (field === 'symbol') return 'Enter a symbol, such as BTCUSD or AAPL.';
  if (field === 'trade') {
    if (reason === 'open-requires-opened-at') return 'Add the opened date and time for an open practice trade.';
    if (reason === 'closed-requires-open-and-close-times') return 'Add both opened and closed date and time for a closed practice trade.';
    if (reason === 'close-requires-open') return 'Add the opened date and time before the closed date and time.';
    if (reason === 'close-before-open') return 'Closed date and time must be after opened date and time.';
    if (reason === 'draft-cannot-have-execution-times') return 'Draft practice trades cannot have opened or closed times yet.';
    return 'Review the practice trade details and try again.';
  }
  if (field.startsWith('executions.')) return field.endsWith('.executedAt') ? 'Add a valid execution date and time.' : 'Enter a positive execution price or quantity.';
  if (field.startsWith('fees.')) return field.endsWith('.currency') ? 'Enter the recorded fee currency.' : 'Enter a positive fee amount, or remove the fee row.';
  return 'Review this value and try again.';
}

const fieldHasError = (feedback: Feedback, field: string): boolean => feedback?.kind === 'error' && feedback.field === field;

/** Practice: paper trades recorded through P29.1 and listed through the P29.2 practice scope; nothing here reaches the journal's real results. */
export function PracticeRoute({ db = kairosDatabase }: PracticeRouteProps) {
  const [draft, setDraft] = useState<ManualTradeDraft>(() => createEmptyManualTradeDraft());
  const [executions, setExecutions] = useState<readonly ManualExecutionRow[]>([]);
  const [fees, setFees] = useState<readonly ManualFeeRow[]>([]);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [history, setHistory] = useState<readonly JournalHistoryEntry[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyStatus, setHistoryStatus] = useState<TradeStatus | ''>('');
  const [listNotice, setListNotice] = useState('');
  const historyRequestSequence = useRef(0);

  const refreshHistory = useCallback(async (): Promise<void> => {
    const requestSequence = ++historyRequestSequence.current;
    setIsHistoryLoading(true);
    setHistoryError(null);
    try {
      const entries = await listJournalHistory(db, historyStatus === '' ? { scope: 'practice' } : { scope: 'practice', status: historyStatus });
      if (requestSequence !== historyRequestSequence.current) return;
      setHistory(entries);
    } catch {
      if (requestSequence !== historyRequestSequence.current) return;
      setHistoryError('Kairos could not load your practice trades. Your stored trades were not changed.');
    } finally {
      if (requestSequence === historyRequestSequence.current) setIsHistoryLoading(false);
    }
  }, [db, historyStatus]);

  useEffect(() => { void refreshHistory(); }, [refreshHistory]);
  useEffect(() => { if (feedback?.kind === 'error') feedbackRef.current?.focus(); }, [feedback]);

  const showOpenedAt = draft.status === 'open' || draft.status === 'closed';
  const showClosedAt = draft.status === 'closed';
  const statusHint = useMemo(() => {
    if (draft.status === 'open') return 'Open practice trades need an opened date and time.';
    if (draft.status === 'closed') return 'Closed practice trades need both opened and closed date and time.';
    if (draft.status === 'draft') return 'Draft practice trades stay unexecuted and do not use opened or closed times.';
    return 'Choose the state that matches the practice trade right now.';
  }, [draft.status]);

  function update<K extends keyof ManualTradeDraft>(field: K, value: ManualTradeDraft[K]): void {
    setDraft(current => ({ ...current, [field]: value }));
    setFeedback(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (isSaving) return;
    setFeedback(null);
    const base = prepareManualTradeSubmission(draft);
    const prepared = base.ok ? prepareManualTradeExecutionDetails(base.input, executions, fees) : base;
    if (!prepared.ok) {
      setFeedback({ kind: 'error', field: prepared.field, message: prepared.type === 'execution-draft-invalid' ? prepared.message : requiredSelectionMessage(prepared.field) });
      return;
    }
    setIsSaving(true);
    const result = await savePracticeTrade(db, prepared.input);
    setIsSaving(false);
    if (!result.ok) {
      if (result.type === 'validation-error') { setFeedback({ kind: 'error', field: result.field, message: validationMessage(result.field, result.reason) }); return; }
      setFeedback({ kind: 'error', message: 'Kairos could not save this practice trade. Your form has been kept so you can try again.' });
      return;
    }
    setDraft(createEmptyManualTradeDraft());
    setExecutions([]);
    setFees([]);
    setFeedback({ kind: 'success', message: 'Practice trade saved. It stays out of your journal results.' });
    setListNotice('');
    await refreshHistory();
  }

  return (
    <section className="kairos-route kairos-journal kairos-practice" aria-labelledby="kairos-practice-title" data-practice-status={isHistoryLoading ? 'loading' : historyError ? 'error' : 'ready'} data-practice-count={history.length}>
      <div className="kairos-journal__heading">
        <div>
          <p className="kairos-journal__eyebrow">Paper trades</p>
          <h1 id="kairos-practice-title">Practice</h1>
        </div>
        <span className="kairos-journal__badge kairos-practice__badge">Practice only</span>
      </div>
      <p className="kairos-journal__intro">Rehearse a trade with the same facts you would log for real. Practice trades are kept apart: they never count in your journal history, daily results, goals or Home.</p>

      {feedback ? <div className={`kairos-journal__feedback kairos-journal__feedback--${feedback.kind}`} role={feedback.kind === 'error' ? 'alert' : 'status'} aria-live="polite" ref={feedbackRef} tabIndex={-1}>{feedback.message}</div> : null}

      <form className="kairos-trade-form" onSubmit={handleSubmit} noValidate>
        <fieldset className="kairos-trade-form__section" disabled={isSaving}>
          <legend>Practice trade details</legend>
          <div className="kairos-trade-form__grid">
            <label className="kairos-field kairos-field--wide" htmlFor="kairos-practice-symbol">
              <span>Symbol <strong>Required</strong></span>
              <input id="kairos-practice-symbol" name="symbol" value={draft.symbol} onChange={event => update('symbol', event.target.value)} autoCapitalize="characters" autoComplete="off" spellCheck={false} aria-invalid={fieldHasError(feedback, 'symbol') || undefined} placeholder="BTCUSD" />
            </label>
            <label className="kairos-field" htmlFor="kairos-practice-market">
              <span>Market <strong>Required</strong></span>
              <select id="kairos-practice-market" name="marketType" value={draft.marketType} onChange={event => update('marketType', event.target.value as ManualTradeDraft['marketType'])} aria-invalid={fieldHasError(feedback, 'marketType') || undefined}>
                <option value="">Choose market</option>
                {MARKET_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="kairos-field" htmlFor="kairos-practice-side">
              <span>Direction <strong>Required</strong></span>
              <select id="kairos-practice-side" name="side" value={draft.side} onChange={event => update('side', event.target.value as ManualTradeDraft['side'])} aria-invalid={fieldHasError(feedback, 'side') || undefined}>
                <option value="">Choose direction</option>
                {SIDE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label className="kairos-field kairos-field--wide" htmlFor="kairos-practice-status">
              <span>Status <strong>Required</strong></span>
              <select id="kairos-practice-status" name="status" value={draft.status} onChange={event => {
                const status = event.target.value as ManualTradeDraft['status'];
                setDraft(current => ({ ...current, status, ...(status === 'draft' || status === 'cancelled' ? { openedAt: '', closedAt: '' } : {}), ...(status === 'open' ? { closedAt: '' } : {}) }));
                setFeedback(null);
              }} aria-describedby="kairos-practice-status-hint" aria-invalid={fieldHasError(feedback, 'status') || fieldHasError(feedback, 'trade') || undefined}>
                <option value="">Choose status</option>
                {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <small id="kairos-practice-status-hint">{statusHint}</small>
            </label>
            {showOpenedAt ? <label className="kairos-field" htmlFor="kairos-practice-opened-at"><span>Opened <strong>Required</strong></span><input id="kairos-practice-opened-at" name="openedAt" type="datetime-local" value={draft.openedAt} onChange={event => update('openedAt', event.target.value)} aria-invalid={fieldHasError(feedback, 'trade') || undefined} /></label> : null}
            {showClosedAt ? <label className="kairos-field" htmlFor="kairos-practice-closed-at"><span>Closed <strong>Required</strong></span><input id="kairos-practice-closed-at" name="closedAt" type="datetime-local" value={draft.closedAt} onChange={event => update('closedAt', event.target.value)} aria-invalid={fieldHasError(feedback, 'trade') || undefined} /></label> : null}
          </div>
        </fieldset>

        <JournalPriceCurrencyField value={draft.priceCurrency ?? ''} onChange={value => update('priceCurrency', value)} disabled={isSaving} error={fieldHasError(feedback, 'grossPnlCurrency') ? PRICE_CURRENCY_INPUT_ERROR : undefined} />
        <JournalExecutionFields executions={executions} fees={fees} onExecutionsChange={rows => { setExecutions(rows); setFeedback(null); }} onFeesChange={rows => { setFees(rows); setFeedback(null); }} canAddExecution={draft.status === 'open' || draft.status === 'closed'} disabled={isSaving} errorField={feedback?.kind === 'error' ? feedback.field : undefined} />
        <JournalClosedTradeGuidance status={draft.status} types={executions.map(row => row.type)} />

        <div className="kairos-trade-form__actions">
          <button className="kairos-trade-form__submit" type="submit" disabled={isSaving}>{isSaving ? 'Saving…' : 'Save practice trade'}</button>
        </div>
      </form>

      <JournalHistoryList db={db} updateNotice={listNotice} onTradeDeleted={async notice => { await refreshHistory(); setListNotice(notice); }} onTradeUpdated={async () => { await refreshHistory(); setListNotice('Practice trade updated. Your saved details are below.'); }} onTradeOpened={async notice => { await refreshHistory(); setListNotice(notice); }} allowedSources={['paper']} entries={history} isLoading={isHistoryLoading} errorMessage={historyError} statusFilter={historyStatus} onStatusFilterChange={setHistoryStatus} />
    </section>
  );
}
