import { type FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { savePracticeTrade } from '../../application/practice';
import {
  createEmptyManualTradeDraft,
  prepareManualTradeSubmission,
  saveManualTrade,
  type ManualTradeDraft,
  type ManualTradeDraftRequiredField,
  type ManualTradeValidationField,
} from '../../application/trades';
import { prepareManualTradeExecutionDetails, type ManualExecutionRow, type ManualFeeRow } from '../../application/trades/manualTradeExecutionDraft';
import { PRICE_CURRENCY_INPUT_ERROR } from '../../application/trades/priceCurrencyInput';
import type { KairosDatabase } from '../../data/database';
import { JournalClosedTradeGuidance } from './JournalClosedTradeGuidance';
import { JournalExecutionFields } from './JournalExecutionFields';
import { JournalPriceCurrencyField } from './JournalPriceCurrencyField';

export type TradeFormKind = 'journal' | 'practice';

interface TradeFormProps {
  readonly db: KairosDatabase;
  readonly kind: TradeFormKind;
  /** Called once after a successful save, when the form is already reset and the success banner shows. */
  readonly onSaved: () => Promise<void>;
}

type Feedback =
  | { readonly kind: 'error'; readonly field?: string; readonly message: string }
  | { readonly kind: 'success'; readonly message: string }
  | null;

interface TradeFormText {
  readonly legend: string;
  readonly hintOpen: string;
  readonly hintClosed: string;
  readonly hintDraft: string;
  readonly hintNone: string;
  readonly openRequiresOpenedAt: string;
  readonly closedRequiresTimes: string;
  readonly draftCannotHaveTimes: string;
  readonly reviewTrade: string;
  readonly submit: string;
  readonly saved: string;
  readonly storageError: string;
  readonly idPrefix: string;
  readonly planIdPrefix: string;
}

const TRADE_FORM_TEXT: Record<TradeFormKind, TradeFormText> = {
  journal: {
    legend: 'Trade details',
    hintOpen: 'Open trades need an opened date and time.',
    hintClosed: 'Closed trades need both opened and closed date and time.',
    hintDraft: 'Draft trades stay unexecuted and do not use opened or closed times.',
    hintNone: 'Choose the state that matches the trade right now.',
    openRequiresOpenedAt: 'Add the opened date and time for an open trade.',
    closedRequiresTimes: 'Add both opened and closed date and time for a closed trade.',
    draftCannotHaveTimes: 'Draft trades cannot have opened or closed times yet.',
    reviewTrade: 'Review the trade details and try again.',
    submit: 'Save trade',
    saved: 'Trade saved to your journal.',
    storageError: 'Kairos could not save this trade. Your form has been kept so you can try again.',
    idPrefix: 'kairos-trade',
    planIdPrefix: 'kairos-plan',
  },
  practice: {
    legend: 'Practice trade details',
    hintOpen: 'Open practice trades need an opened date and time.',
    hintClosed: 'Closed practice trades need both opened and closed date and time.',
    hintDraft: 'Draft practice trades stay unexecuted and do not use opened or closed times.',
    hintNone: 'Choose the state that matches the practice trade right now.',
    openRequiresOpenedAt: 'Add the opened date and time for an open practice trade.',
    closedRequiresTimes: 'Add both opened and closed date and time for a closed practice trade.',
    draftCannotHaveTimes: 'Draft practice trades cannot have opened or closed times yet.',
    reviewTrade: 'Review the practice trade details and try again.',
    submit: 'Save practice trade',
    saved: 'Practice trade saved. It stays out of your journal results.',
    storageError: 'Kairos could not save this practice trade. Your form has been kept so you can try again.',
    idPrefix: 'kairos-practice',
    planIdPrefix: 'kairos-practice-plan',
  },
};

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

function validationMessage(text: TradeFormText, field: ManualTradeValidationField, reason: string): string {
  if (field === 'grossPnlCurrency') return PRICE_CURRENCY_INPUT_ERROR;
  if (field === 'symbol') return 'Enter a symbol, such as BTCUSD or AAPL.';
  if (field === 'trade') {
    if (reason === 'open-requires-opened-at') return text.openRequiresOpenedAt;
    if (reason === 'closed-requires-open-and-close-times') return text.closedRequiresTimes;
    if (reason === 'close-requires-open') return 'Add the opened date and time before the closed date and time.';
    if (reason === 'close-before-open') return 'Closed date and time must be after opened date and time.';
    if (reason === 'draft-cannot-have-execution-times') return text.draftCannotHaveTimes;
    return text.reviewTrade;
  }
  if (field.startsWith('executions.')) return field.endsWith('.executedAt') ? 'Add a valid execution date and time.' : 'Enter a positive execution price or quantity.';
  if (field.startsWith('fees.')) return field.endsWith('.currency') ? 'Enter the recorded fee currency.' : 'Enter a positive fee amount, or remove the fee row.';
  if (field.startsWith('plan.')) return 'Enter a positive number or leave this field empty.';
  return 'Review this value and try again.';
}

function fieldHasError(feedback: Feedback, field: string): boolean {
  return feedback?.kind === 'error' && feedback.field === field;
}

/** The one trade form for Journal (real trades) and Practice (paper trades); only the save command and wording differ. */
export function TradeForm({ db, kind, onSaved }: TradeFormProps) {
  const text = TRADE_FORM_TEXT[kind];
  const { idPrefix, planIdPrefix } = text;
  const [draft, setDraft] = useState<ManualTradeDraft>(() => createEmptyManualTradeDraft());
  const [executions, setExecutions] = useState<readonly ManualExecutionRow[]>([]);
  const [fees, setFees] = useState<readonly ManualFeeRow[]>([]);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => { if (feedback?.kind === 'error') feedbackRef.current?.focus(); }, [feedback]);

  const showOpenedAt = draft.status === 'open' || draft.status === 'closed';
  const showClosedAt = draft.status === 'closed';
  const statusHint = useMemo(() => {
    if (draft.status === 'open') return text.hintOpen;
    if (draft.status === 'closed') return text.hintClosed;
    if (draft.status === 'draft') return text.hintDraft;
    return text.hintNone;
  }, [draft.status, text]);

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
    const result = kind === 'practice' ? await savePracticeTrade(db, prepared.input) : await saveManualTrade(db, prepared.input);
    setIsSaving(false);

    if (!result.ok) {
      if (result.type === 'validation-error') {
        setFeedback({
          kind: 'error',
          field: result.field,
          message: validationMessage(text, result.field, result.reason),
        });
        return;
      }
      setFeedback({ kind: 'error', message: text.storageError });
      return;
    }

    // Commit the reset and the success banner before the page refreshes its lists.
    flushSync(() => {
      setDraft(createEmptyManualTradeDraft());
      setExecutions([]);
      setFees([]);
      setFeedback({ kind: 'success', message: text.saved });
    });
    await onSaved();
  }

  return (
    <>
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
          <legend>{text.legend}</legend>
          <div className="kairos-trade-form__grid">
            <label className="kairos-field kairos-field--wide" htmlFor={`${idPrefix}-symbol`}>
              <span>Symbol <strong>Required</strong></span>
              <input
                id={`${idPrefix}-symbol`}
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

            <label className="kairos-field" htmlFor={`${idPrefix}-market`}>
              <span>Market <strong>Required</strong></span>
              <select
                id={`${idPrefix}-market`}
                name="marketType"
                value={draft.marketType}
                onChange={(event) => update('marketType', event.target.value as ManualTradeDraft['marketType'])}
                aria-invalid={fieldHasError(feedback, 'marketType') || undefined}
              >
                <option value="">Choose market</option>
                {MARKET_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>

            <label className="kairos-field" htmlFor={`${idPrefix}-side`}>
              <span>Direction <strong>Required</strong></span>
              <select
                id={`${idPrefix}-side`}
                name="side"
                value={draft.side}
                onChange={(event) => update('side', event.target.value as ManualTradeDraft['side'])}
                aria-invalid={fieldHasError(feedback, 'side') || undefined}
              >
                <option value="">Choose direction</option>
                {SIDE_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>

            <label className="kairos-field kairos-field--wide" htmlFor={`${idPrefix}-status`}>
              <span>Status <strong>Required</strong></span>
              <select
                id={`${idPrefix}-status`}
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
                aria-describedby={`${idPrefix}-status-hint`}
                aria-invalid={fieldHasError(feedback, 'status') || fieldHasError(feedback, 'trade') || undefined}
              >
                <option value="">Choose status</option>
                {STATUS_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
              <small id={`${idPrefix}-status-hint`}>{statusHint}</small>
            </label>

            {showOpenedAt ? (
              <label className="kairos-field" htmlFor={`${idPrefix}-opened-at`}>
                <span>Opened <strong>Required</strong></span>
                <input
                  id={`${idPrefix}-opened-at`}
                  name="openedAt"
                  type="datetime-local"
                  value={draft.openedAt}
                  onChange={(event) => update('openedAt', event.target.value)}
                  aria-invalid={fieldHasError(feedback, 'trade') || undefined}
                />
              </label>
            ) : null}

            {showClosedAt ? (
              <label className="kairos-field" htmlFor={`${idPrefix}-closed-at`}>
                <span>Closed <strong>Required</strong></span>
                <input
                  id={`${idPrefix}-closed-at`}
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
            <label className="kairos-field" htmlFor={`${planIdPrefix}-entry`}>
              <span>Planned entry</span>
              <input id={`${planIdPrefix}-entry`} inputMode="decimal" value={draft.plan.plannedEntryPrice} onChange={(event) => updatePlan('plannedEntryPrice', event.target.value)} aria-invalid={fieldHasError(feedback, 'plan.plannedEntryPrice') || undefined} />
            </label>
            <label className="kairos-field" htmlFor={`${planIdPrefix}-stop`}>
              <span>Planned stop</span>
              <input id={`${planIdPrefix}-stop`} inputMode="decimal" value={draft.plan.plannedStopPrice} onChange={(event) => updatePlan('plannedStopPrice', event.target.value)} aria-invalid={fieldHasError(feedback, 'plan.plannedStopPrice') || undefined} />
            </label>
            <label className="kairos-field" htmlFor={`${planIdPrefix}-target`}>
              <span>Planned target</span>
              <input id={`${planIdPrefix}-target`} inputMode="decimal" value={draft.plan.plannedTargetPrice} onChange={(event) => updatePlan('plannedTargetPrice', event.target.value)} aria-invalid={fieldHasError(feedback, 'plan.plannedTargetPrice') || undefined} />
            </label>
            <label className="kairos-field" htmlFor={`${planIdPrefix}-quantity`}>
              <span>Planned quantity</span>
              <input id={`${planIdPrefix}-quantity`} inputMode="decimal" value={draft.plan.plannedQuantity} onChange={(event) => updatePlan('plannedQuantity', event.target.value)} aria-invalid={fieldHasError(feedback, 'plan.plannedQuantity') || undefined} />
            </label>
          </div>
        </fieldset>

        </details>

        <div className="kairos-trade-form__actions">
          <button className="kairos-trade-form__submit" type="submit" disabled={isSaving}>
            {isSaving ? 'Saving…' : text.submit}
          </button>
        </div>
      </form>
    </>
  );
}
