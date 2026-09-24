import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createEmptyManualTradeDraft,
  prepareManualTradeSubmission,
  saveManualTrade,
  type ManualTradeDraft,
  type ManualTradeDraftRequiredField,
  type ManualTradeValidationField,
} from '../application/trades';
import { JOURNAL_HISTORY_SOURCES, listJournalHistory, type JournalHistoryEntry } from '../application/journal';
import { JournalHistoryList } from './JournalHistoryList';
import { JournalDailyResults } from './JournalDailyResults';
import { kairosDatabase, type KairosDatabase } from '../data/database';
import type { TradeStatus } from '../domain/trades';
import './journalRoute.css';
import { JournalPriceCurrencyField } from './JournalPriceCurrencyField';
import { JournalClosedTradeGuidance } from './JournalClosedTradeGuidance';
import { PRICE_CURRENCY_INPUT_ERROR } from '../application/trades/priceCurrencyInput';
import { JournalExecutionFields } from './JournalExecutionFields';
import { prepareManualTradeExecutionDetails, type ManualExecutionRow, type ManualFeeRow } from '../application/trades/manualTradeExecutionDraft';

interface JournalRouteProps {
  readonly db?: KairosDatabase;
}

type Feedback =
  | { readonly kind: 'error'; readonly field?: string; readonly message: string }
  | { readonly kind: 'success'; readonly message: string }
  | null;

const MARKET_OPTIONS = [
  ['stock', 'Stocks'],
  ['forex', 'Forex'],
  ['crypto', 'Crypto'],
  ['futures', 'Futures'],
  ['options', 'Options'],
  ['other', 'Other'],
] as const;

const SIDE_OPTIONS = [
  ['long', 'Long'],
  ['short', 'Short'],
] as const;

const STATUS_OPTIONS = [
  ['draft', 'Draft'],
  ['open', 'Open'],
  ['closed', 'Closed'],
  ['cancelled', 'Cancelled'],
] as const;

function requiredSelectionMessage(field: ManualTradeDraftRequiredField): string {
  if (field === 'marketType') return 'Choose a market.';
  if (field === 'side') return 'Choose long or short.';
  return 'Choose a trade status.';
}

function validationMessage(field: ManualTradeValidationField, reason: string): string {
  if (field === 'grossPnlCurrency') return PRICE_CURRENCY_INPUT_ERROR;
  if (field === 'symbol') return 'Enter a symbol, such as BTCUSD or AAPL.';
  if (field === 'trade') {
    if (reason === 'open-requires-opened-at') return 'Add the opened date and time for an open trade.';
    if (reason === 'closed-requires-open-and-close-times') return 'Add both opened and closed date and time for a closed trade.';
    if (reason === 'close-requires-open') return 'Add the opened date and time before the closed date and time.';
    if (reason === 'close-before-open') return 'Closed date and time must be after opened date and time.';
    if (reason === 'draft-cannot-have-execution-times') return 'Draft trades cannot have opened or closed times yet.';
    return 'Review the trade details and try again.';
  }
  if (field.startsWith('executions.')) return field.endsWith('.executedAt') ? 'Add a valid execution date and time.' : 'Enter a positive execution price or quantity.';
  if (field.startsWith('fees.')) return field.endsWith('.currency') ? 'Enter the recorded fee currency.' : 'Enter a positive fee amount, or remove the fee row.';
  if (field.startsWith('plan.')) return 'Enter a positive number or leave this field empty.';
  return 'Review this value and try again.';
}

function fieldHasError(feedback: Feedback, field: string): boolean {
  return feedback?.kind === 'error' && feedback.field === field;
}

export function JournalRoute({ db = kairosDatabase }: JournalRouteProps) {
  const [draft, setDraft] = useState<ManualTradeDraft>(() => createEmptyManualTradeDraft());
  const [executions, setExecutions] = useState<readonly ManualExecutionRow[]>([]);
  const [fees, setFees] = useState<readonly ManualFeeRow[]>([]);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [history, setHistory] = useState<readonly JournalHistoryEntry[]>([]);
  const [isHistoryLoading, setIsHistoryLoading] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [updateNotice, setUpdateNotice] = useState('');
  const [historyStatus, setHistoryStatus] = useState<TradeStatus | ''>('');
  const [journalRevision, setJournalRevision] = useState(0);
  const historyRequestSequence = useRef(0);

  const refreshHistory = useCallback(async (): Promise<void> => {
    const requestSequence = ++historyRequestSequence.current;
    setIsHistoryLoading(true);
    setHistoryError(null);
    try {
      const entries = await listJournalHistory(db, historyStatus === '' ? {} : { status: historyStatus });
      if (requestSequence !== historyRequestSequence.current) return;
      setHistory(entries);
    } catch {
      if (requestSequence !== historyRequestSequence.current) return;
      setHistoryError('Kairos could not load your saved trade history. Your stored trades were not changed.');
    } finally {
      if (requestSequence === historyRequestSequence.current) setIsHistoryLoading(false);
    }
  }, [db, historyStatus]);

  useEffect(() => { void refreshHistory(); }, [refreshHistory]);

  useEffect(() => { if (feedback?.kind === 'error') feedbackRef.current?.focus(); }, [feedback]);

  const showOpenedAt = draft.status === 'open' || draft.status === 'closed';
  const showClosedAt = draft.status === 'closed';
  const statusHint = useMemo(() => {
    if (draft.status === 'open') return 'Open trades need an opened date and time.';
    if (draft.status === 'closed') return 'Closed trades need both opened and closed date and time.';
    if (draft.status === 'draft') return 'Draft trades stay unexecuted and do not use opened or closed times.';
    return 'Choose the state that matches the trade right now.';
  }, [draft.status]);

  function update<K extends keyof ManualTradeDraft>(field: K, value: ManualTradeDraft[K]): void {
    setDraft((current) => ({ ...current, [field]: value }));
    setFeedback(null);
  }

  function updatePlan(field: keyof ManualTradeDraft['plan'], value: string): void {
    setDraft((current) => ({
      ...current,
      plan: { ...current.plan, [field]: value },
    }));
    setFeedback(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (isSaving) return;
    setFeedback(null);

    const base = prepareManualTradeSubmission(draft);
    const prepared = base.ok ? prepareManualTradeExecutionDetails(base.input, executions, fees) : base;
    if (!prepared.ok) {
      setFeedback({
        kind: 'error',
        field: prepared.field,
        message: prepared.type === 'execution-draft-invalid' ? prepared.message : requiredSelectionMessage(prepared.field),
      });
      return;
    }

    setIsSaving(true);
    const result = await saveManualTrade(db, prepared.input);
    setIsSaving(false);

    if (!result.ok) {
      if (result.type === 'validation-error') {
        setFeedback({
          kind: 'error',
          field: result.field,
          message: validationMessage(result.field, result.reason),
        });
        return;
      }
      setFeedback({ kind: 'error', message: 'Kairos could not save this trade. Your form has been kept so you can try again.' });
      return;
    }

    setDraft(createEmptyManualTradeDraft());
    setExecutions([]);
    setFees([]);
    setFeedback({ kind: 'success', message: 'Trade saved to your journal.' });
    await refreshHistory();
    setJournalRevision((current) => current + 1);
  }

  return (
    <section className="kairos-route kairos-journal" aria-labelledby="kairos-journal-title">
      <div className="kairos-journal__heading">
        <div>
          <p className="kairos-journal__eyebrow">Manual trade</p>
          <h1 id="kairos-journal-title">Journal</h1>
        </div>
        <span className="kairos-journal__badge">Local-first</span>
      </div>
      <p className="kairos-journal__intro">Log the trade facts you know now. Plan numbers are optional and can be left blank.</p>

      {feedback ? (
        <div
          className={`kairos-journal__feedback kairos-journal__feedback--${feedback.kind}`}
          role={feedback.kind === 'error' ? 'alert' : 'status'}
          aria-live="polite"
          ref={feedbackRef}
          tabIndex={-1}
        >
          {feedback.message}
        </div>
      ) : null}

      <form className="kairos-trade-form" onSubmit={handleSubmit} noValidate>
        <fieldset className="kairos-trade-form__section" disabled={isSaving}>
          <legend>Trade details</legend>
          <div className="kairos-trade-form__grid">
            <label className="kairos-field kairos-field--wide" htmlFor="kairos-trade-symbol">
              <span>Symbol <strong>Required</strong></span>
              <input
                id="kairos-trade-symbol"
                name="symbol"
                value={draft.symbol}
                onChange={(event) => update('symbol', event.target.value)}
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={fieldHasError(feedback, 'symbol') || undefined}
                placeholder="BTCUSD"
              />
            </label>

            <label className="kairos-field" htmlFor="kairos-trade-market">
              <span>Market <strong>Required</strong></span>
              <select
                id="kairos-trade-market"
                name="marketType"
                value={draft.marketType}
                onChange={(event) => update('marketType', event.target.value as ManualTradeDraft['marketType'])}
                aria-invalid={fieldHasError(feedback, 'marketType') || undefined}
              >
                <option value="">Choose market</option>
                {MARKET_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>

            <label className="kairos-field" htmlFor="kairos-trade-side">
              <span>Direction <strong>Required</strong></span>
              <select
                id="kairos-trade-side"
                name="side"
                value={draft.side}
                onChange={(event) => update('side', event.target.value as ManualTradeDraft['side'])}
                aria-invalid={fieldHasError(feedback, 'side') || undefined}
              >
                <option value="">Choose direction</option>
                {SIDE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>

            <label className="kairos-field kairos-field--wide" htmlFor="kairos-trade-status">
              <span>Status <strong>Required</strong></span>
              <select
                id="kairos-trade-status"
                name="status"
                value={draft.status}
                onChange={(event) => {
                  const status = event.target.value as ManualTradeDraft['status'];
                  setDraft((current) => ({
                    ...current,
                    status,
                    ...(status === 'draft' || status === 'cancelled' ? { openedAt: '', closedAt: '' } : {}),
                    ...(status === 'open' ? { closedAt: '' } : {}),
                  }));
                  setFeedback(null);
                }}
                aria-describedby="kairos-trade-status-hint"
                aria-invalid={fieldHasError(feedback, 'status') || fieldHasError(feedback, 'trade') || undefined}
              >
                <option value="">Choose status</option>
                {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <small id="kairos-trade-status-hint">{statusHint}</small>
            </label>

            {showOpenedAt ? (
              <label className="kairos-field" htmlFor="kairos-trade-opened-at">
                <span>Opened <strong>Required</strong></span>
                <input
                  id="kairos-trade-opened-at"
                  name="openedAt"
                  type="datetime-local"
                  value={draft.openedAt}
                  onChange={(event) => update('openedAt', event.target.value)}
                  aria-invalid={fieldHasError(feedback, 'trade') || undefined}
                />
              </label>
            ) : null}

            {showClosedAt ? (
              <label className="kairos-field" htmlFor="kairos-trade-closed-at">
                <span>Closed <strong>Required</strong></span>
                <input
                  id="kairos-trade-closed-at"
                  name="closedAt"
                  type="datetime-local"
                  value={draft.closedAt}
                  onChange={(event) => update('closedAt', event.target.value)}
                  aria-invalid={fieldHasError(feedback, 'trade') || undefined}
                />
              </label>
            ) : null}
          </div>
        </fieldset>

        <JournalPriceCurrencyField value={draft.priceCurrency ?? ''} onChange={value => update('priceCurrency', value)} disabled={isSaving} error={fieldHasError(feedback, 'grossPnlCurrency') ? PRICE_CURRENCY_INPUT_ERROR : undefined} />
        <JournalExecutionFields
          executions={executions} fees={fees}
          onExecutionsChange={rows => { setExecutions(rows); setFeedback(null); }}
          onFeesChange={rows => { setFees(rows); setFeedback(null); }}
          canAddExecution={draft.status === 'open' || draft.status === 'closed'} disabled={isSaving}
          errorField={feedback?.kind === 'error' ? feedback.field : undefined}
        />

        <JournalClosedTradeGuidance status={draft.status} types={executions.map(row => row.type)} />

        <details className="kairos-trade-form__optional" open={feedback?.kind === 'error' && feedback.field?.startsWith('plan.') || undefined}>
          <summary>Trade plan · Optional</summary>
        <fieldset className="kairos-trade-form__section" disabled={isSaving}>
          <legend>Trade plan <span>Optional</span></legend>
          <p className="kairos-trade-form__section-copy">Use the numbers you planned before or during the trade. Your plan stays separate from actual entries and exits.</p>
          <div className="kairos-trade-form__grid">
            <label className="kairos-field" htmlFor="kairos-plan-entry">
              <span>Planned entry</span>
              <input id="kairos-plan-entry" inputMode="decimal" value={draft.plan.plannedEntryPrice} onChange={(event) => updatePlan('plannedEntryPrice', event.target.value)} aria-invalid={fieldHasError(feedback, 'plan.plannedEntryPrice') || undefined} />
            </label>
            <label className="kairos-field" htmlFor="kairos-plan-stop">
              <span>Planned stop</span>
              <input id="kairos-plan-stop" inputMode="decimal" value={draft.plan.plannedStopPrice} onChange={(event) => updatePlan('plannedStopPrice', event.target.value)} aria-invalid={fieldHasError(feedback, 'plan.plannedStopPrice') || undefined} />
            </label>
            <label className="kairos-field" htmlFor="kairos-plan-target">
              <span>Planned target</span>
              <input id="kairos-plan-target" inputMode="decimal" value={draft.plan.plannedTargetPrice} onChange={(event) => updatePlan('plannedTargetPrice', event.target.value)} aria-invalid={fieldHasError(feedback, 'plan.plannedTargetPrice') || undefined} />
            </label>
            <label className="kairos-field" htmlFor="kairos-plan-quantity">
              <span>Planned quantity</span>
              <input id="kairos-plan-quantity" inputMode="decimal" value={draft.plan.plannedQuantity} onChange={(event) => updatePlan('plannedQuantity', event.target.value)} aria-invalid={fieldHasError(feedback, 'plan.plannedQuantity') || undefined} />
            </label>
          </div>
        </fieldset>

        </details>

        <div className="kairos-trade-form__actions">
          <button className="kairos-trade-form__submit" type="submit" disabled={isSaving}>
            {isSaving ? 'Saving…' : 'Save trade'}
          </button>
        </div>
      </form>

      <JournalDailyResults db={db} refreshRevision={journalRevision} />

      <JournalHistoryList
        db={db}
        allowedSources={JOURNAL_HISTORY_SOURCES.real}
        updateNotice={updateNotice}
        onTradeUpdated={async () => { await refreshHistory(); setJournalRevision(current => current + 1); setUpdateNotice('Trade updated. Your saved details are below.'); }}
        onTradeDeleted={async notice => { await refreshHistory(); setJournalRevision(current => current + 1); setUpdateNotice(notice); }}
        onTradeOpened={async notice => { await refreshHistory(); setJournalRevision(current => current + 1); setUpdateNotice(notice); }}
        entries={history}
        isLoading={isHistoryLoading}
        errorMessage={historyError}
        statusFilter={historyStatus}
        onStatusFilterChange={setHistoryStatus}
      />
    </section>
  );
}
