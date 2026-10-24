import { type FormEvent, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import type { DisciplineAnswerInput, TradeDisciplineParts } from '../../application/discipline';
import {
  beforeYouSaveSymbol, loadBeforeYouSave, loadRecentSizes, previewBeforeYouSave, type BeforeYouSaveFacts, type LoadBeforeYouSaveResult, type LoadRecentSizesResult,
} from '../../application/discipline/beforeYouSave';
import { savePracticeTrade } from '../../application/practice';
import {
  createEmptyManualTradeDraft,
  marketAsksContractSize,
  prepareManualTradeSubmission,
  saveManualTrade,
  type ManualTradeDraft,
  type ManualTradeDraftRequiredField,
  type ManualTradeValidationField,
  type PrepareManualTradeSubmissionResult,
} from '../../application/trades';
import { prepareManualTradeExecutionDetails, type ManualExecutionRow, type ManualFeeRow } from '../../application/trades/manualTradeExecutionDraft';
import { PRICE_CURRENCY_INPUT_ERROR } from '../../application/trades/priceCurrencyInput';
import { checkTypedCryptoSymbol, type SymbolSearchRow } from '../../application/market-reference/symbolSearch';
import { createEmptyQuickTradeLogDraft, quickTradeLogFieldFor, quickTradeLogRows, type QuickTradeLogDraft, type QuickTradeLogField } from '../../application/trades/quickTradeLog';
import type { KeptTradeFormDraft, TradeFormDraft } from '../../application/trades/tradeFormDraft';
import type { KairosDatabase } from '../../data/database';
import type { StrategyId } from '../../domain/discipline';
import type { DecimalString, TradeId } from '../../domain/trades';
import { Button, Field, PriceInput, Segmented, Select, useToast } from '../../design-system/primitives';
import { JournalClosedTradeGuidance } from './JournalClosedTradeGuidance';
import { JournalExecutionFields } from './JournalExecutionFields';
import { ForexTradeNote, forexQuantityHint } from './ForexTradeNote';
import { StockTradeNote, STOCK_QUANTITY_HINT, STOCK_TICKER_MESSAGES } from './StockTradeNote';
import { JournalPriceCurrencyField } from './JournalPriceCurrencyField';
import { TradeStrategyField } from './TradeStrategyField';
import { TradeTagsField } from './TradeTagsField';
import { BeforeYouTradeField } from './BeforeYouTradeField';
import { BeforeYouSaveBox } from './BeforeYouSaveBox';
import { CONTRACT_SIZE_HINT } from './AddContractSizeControl';
import { MarketMinuteLink } from './MarketMinute';
import { PriceNowInput } from './PriceNowInput';
import { SymbolSearchField } from './SymbolSearchField';
import { TradeFormMarketContext, useTradeFormMarketList } from './tradeFormMarket';
import { useKeptTradeFormDraft } from './useKeptTradeFormDraft';
import './tradeForm.css';

export type TradeFormKind = 'journal' | 'practice';

interface TradeFormProps {
  readonly db: KairosDatabase;
  readonly kind: TradeFormKind;
  /** Called once after a successful save with the new trade's id, when the form is already reset and the success banner shows. */
  readonly onSaved: (tradeId: TradeId) => Promise<void>;
  /** The device clock for the "Now" buttons; tests inject a fixed one. */
  readonly now?: () => Date;
  /** The draft the form opens with, read once when it mounts (Practice passes a plan from the calculator); later changes are ignored. */
  readonly initialDraft?: ManualTradeDraft;
  /** The market the form starts on while none is chosen: the first one the trader trades (D223); null keeps it blank. */
  readonly defaultMarket?: ManualTradeDraft['marketType'] | null;
}

type TradeFormMode = 'quick' | 'full';

/** The chosen mode is remembered on this device; Journal and Practice share it. */
export const TRADE_FORM_MODE_STORAGE_KEY = 'kairos.trade-form.mode.v1';

function readTradeFormMode(): TradeFormMode {
  try {
    return window.localStorage.getItem(TRADE_FORM_MODE_STORAGE_KEY) === 'quick' ? 'quick' : 'full';
  } catch {
    return 'full';
  }
}

function writeTradeFormMode(mode: TradeFormMode): void {
  try {
    window.localStorage.setItem(TRADE_FORM_MODE_STORAGE_KEY, mode);
  } catch {
    // Not remembering the choice is fine; the form still works.
  }
}

const QUICK_NO_STOP_HINT = "Without a stop, Kairos can't draw your risk or show × what you risked.";

const QUICK_MESSAGES: Readonly<Record<QuickTradeLogField, string>> = {
  entryPrice: 'Enter the entry price as a number above 0, such as 64000.5.',
  exitPrice: 'Enter the exit price as a number above 0, such as 64250.',
  quantity: 'Enter the quantity as a number above 0, such as 0.5.',
  openedAt: 'Add when you opened the trade.',
  closedAt: 'Add when you closed the trade.',
};

/** U11: what each new field says when its value is refused (one message for the banner and under the field). */
const NEW_FIELD_MESSAGES: Readonly<Partial<Record<ManualTradeValidationField, string>>> = {
  contractSize: 'Enter how much one point is worth, such as 50.',
  leverage: 'Leverage is a number such as 10, up to 1000.',
  tags: 'At most 10 tags, each up to 24 letters.',
  exchange: '"Where you traded" can be up to 40 letters.',
  'plan.reason': '"Why I\'m taking it" can be up to 500 letters.',
  'discipline.checklist': 'Your checklist changed in another tab. Reload the page and tick it again.',
  'discipline.strategy': 'That strategy changed in another tab. Choose it again, or choose none.',
  'discipline.beforeSave': 'Review the trade details and try again.',
};

const pad = (value: number): string => String(value).padStart(2, '0');

/** The device's local time in the `datetime-local` input format. */
function localDateTimeValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const wallClock = (): Date => new Date();

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
    hintDraft: 'A planned trade has no entries, exits or times yet.',
    hintNone: 'Choose the state that matches the trade right now.',
    openRequiresOpenedAt: 'Add the opened date and time for an open trade.',
    closedRequiresTimes: 'Add both opened and closed date and time for a closed trade.',
    draftCannotHaveTimes: 'A planned trade cannot have opened or closed times yet.',
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
    hintDraft: 'A planned practice trade has no entries, exits or times yet.',
    hintNone: 'Choose the state that matches the practice trade right now.',
    openRequiresOpenedAt: 'Add the opened date and time for an open practice trade.',
    closedRequiresTimes: 'Add both opened and closed date and time for a closed practice trade.',
    draftCannotHaveTimes: 'A planned practice trade cannot have opened or closed times yet.',
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
  // U12 (D245): the stored value stays `draft`.
  ['draft', 'Planned (not in yet)'],
  ['open', 'Open'],
  ['closed', 'Closed'],
  ['cancelled', 'Cancelled'],
] as const;

/** P31: plain words for a forex pair problem found before saving. */
function forexMessage(problem: Extract<PrepareManualTradeSubmissionResult, { type: 'forex-pair' | 'forex-price-currency' }>): string {
  if (problem.type === 'forex-price-currency') return `Prices of ${problem.pair.label} are in ${problem.pair.quote}. Enter ${problem.pair.quote} as the currency code, or leave it empty.`;
  return problem.reason === 'same-currency' ? 'A currency pair has two different currencies, such as EURUSD.' : 'Type the currency pair as 6 letters, such as EURUSD or EUR/USD.';
}

function requiredSelectionMessage(field: ManualTradeDraftRequiredField): string {
  if (field === 'marketType') return 'Choose a market.';
  if (field === 'side') return 'Choose long or short.';
  return 'Choose a trade status.';
}

function validationMessage(text: TradeFormText, field: ManualTradeValidationField, reason: string): string {
  const newField = NEW_FIELD_MESSAGES[field];
  if (newField) return newField;
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
  if (field.startsWith('executions.')) return field.endsWith('.executedAt') ? 'Add a valid date and time for each entry and exit.' : 'Enter a positive price and quantity for each entry and exit.';
  if (field.startsWith('fees.')) return field.endsWith('.currency') ? 'Enter the recorded fee currency.' : 'Enter a positive fee amount, or remove the fee row.';
  if (field.startsWith('plan.')) return 'Enter a positive number or leave this field empty.';
  return 'Review this value and try again.';
}

type BeforeSaveRead = Readonly<{ facts: BeforeYouSaveFacts | null; failed: boolean }>;
type SizesRead = Readonly<{ symbol: string; sizes: readonly DecimalString[] | null; failed: boolean }>;
const factsRead = (result: LoadBeforeYouSaveResult): BeforeSaveRead => (result.ok ? { facts: result.facts, failed: false } : { facts: null, failed: true });
const sizesReadFor = (symbol: string, result: LoadRecentSizesResult): SizesRead => (result.ok ? { symbol, sizes: result.sizes, failed: false } : { symbol, sizes: null, failed: true });
/** The usual size is read for the symbol once typing pauses, not on every key. */
const SIZES_READ_PAUSE_MS = 300;

function fieldHasError(feedback: Feedback, field: string): boolean {
  return feedback?.kind === 'error' && feedback.field === field;
}

/** The one trade form for Journal (real trades) and Practice (paper trades); only the save command and wording differ. */
export function TradeForm({ db, kind, onSaved, now = wallClock, initialDraft, defaultMarket = null }: TradeFormProps) {
  const text = TRADE_FORM_TEXT[kind];
  const { idPrefix, planIdPrefix } = text;
  const [draft, setDraft] = useState<ManualTradeDraft>(() => initialDraft ?? createEmptyManualTradeDraft());
  // The trader's first market arrives after the form shows; it fills the market only while none is chosen.
  useEffect(() => {
    if (defaultMarket !== null) setDraft(current => (current.marketType === '' ? { ...current, marketType: defaultMarket } : current));
  }, [defaultMarket]);
  const [planShown, setPlanShown] = useState(() => initialDraft !== undefined && Object.values(initialDraft.plan).some(value => typeof value === 'string' && value.trim() !== ''));
  const [executions, setExecutions] = useState<readonly ManualExecutionRow[]>([]);
  const [fees, setFees] = useState<readonly ManualFeeRow[]>([]);
  // Bumped when a save empties the form: the entry and fee rows mount fresh, which closes any Undo for the saved rows.
  const [formGeneration, setFormGeneration] = useState(0);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [strategyId, setStrategyId] = useState<StrategyId | ''>('');
  // U12 (D241): what is ticked before Save, saved with the trade in one write.
  const [checklistAnswers, setChecklistAnswers] = useState<readonly DisciplineAnswerInput[]>([]);
  const [strategyAnswers, setStrategyAnswers] = useState<readonly DisciplineAnswerInput[]>([]);
  // U12 (D242): what "Before you save" read (again after each save and on "Try again"), and the optional reason.
  const beforeSaveScope = kind === 'practice' ? 'practice' : 'real';
  const [beforeSaveRead, setBeforeSaveRead] = useState<BeforeSaveRead>({ facts: null, failed: false });
  const [beforeSaveReads, setBeforeSaveReads] = useState(0);
  const [brokenRules, setBrokenRules] = useState(0);
  const [saveAnywayReason, setSaveAnywayReason] = useState('');
  const [sizesRead, setSizesRead] = useState<SizesRead>({ symbol: '', sizes: null, failed: false });
  const [retrying, setRetrying] = useState(false);
  const [mode, setMode] = useState<TradeFormMode>(readTradeFormMode);
  const [quick, setQuick] = useState<QuickTradeLogDraft>(createEmptyQuickTradeLogDraft);
  const isQuick = mode === 'quick';

  // U14 (D258): what is typed is kept on this device and filled back in when the form opens again (Practice's plan
  // from the calculator wins over a kept trade). A save clears it; "Start over" clears it with Undo for a moment.
  const typed = useMemo<TradeFormDraft>(() => ({ trade: draft, quick, executions, fees }), [draft, quick, executions, fees]);
  const [keptShown, setKeptShown] = useState(false);
  const toast = useToast();
  function fillIn(kept: Pick<KeptTradeFormDraft, 'mode' | 'draft'>): void {
    setDraft(kept.draft.trade);
    setQuick(kept.draft.quick);
    setExecutions(kept.draft.executions);
    setFees(kept.draft.fees);
    setMode(kept.mode);
    setPlanShown(Object.values(kept.draft.trade.plan).some(value => typeof value === 'string' && value.trim() !== ''));
    setCurrencyFilledBy(null);
    setFormGeneration(current => current + 1);
  }
  const keptDraft = useKeptTradeFormDraft(db, kind, { mode, draft: typed }, {
    read: initialDraft === undefined,
    onFound: kept => { fillIn(kept); setKeptShown(true); },
  });
  /** Empties every field, as after a save, without the saved message. */
  function emptyForm(): void {
    setDraft({ ...createEmptyManualTradeDraft(), marketType: defaultMarket ?? '' });
    setCurrencyFilledBy(null);
    setPlanShown(false);
    setExecutions([]);
    setFees([]);
    setFormGeneration(current => current + 1);
    setQuick(createEmptyQuickTradeLogDraft());
    setStrategyId('');
    setChecklistAnswers([]);
    setStrategyAnswers([]);
    setSaveAnywayReason('');
    setKeptShown(false);
  }
  function startOver(): void {
    const before = { mode, draft: typed };
    flushSync(() => { emptyForm(); setFeedback(null); });
    void keptDraft.clear();
    document.getElementById(`${idPrefix}-symbol`)?.focus();
    toast.show({ message: 'Started over.', action: { label: 'Undo', onAction: () => fillIn(before) } });
  }

  // U14 (D254): the symbol search and the currency from a crypto market's quote asset. The list is read once the
  // trader types a symbol; a currency Kairos filled follows the symbol, one the trader typed is never replaced.
  const searchable = useContext(TradeFormMarketContext) !== null;
  const cryptoOrOpen = draft.marketType === 'crypto' || draft.marketType === '';
  const marketList = useTradeFormMarketList(searchable && cryptoOrOpen && draft.symbol.trim() !== '');
  const markets = marketList.phase === 'ready' ? marketList.markets : null;
  const coinNames = marketList.phase === 'ready' ? marketList.names : null;
  const typedCrypto = draft.marketType === 'crypto' && markets !== null ? checkTypedCryptoSymbol(draft.symbol, markets) : null;
  const [currencyFilledBy, setCurrencyFilledBy] = useState<string | null>(null);
  const listedSymbol = typedCrypto?.kind === 'listed' ? typedCrypto.symbol : null;
  const listedQuote = typedCrypto?.kind === 'listed' ? typedCrypto.quote : null;
  const judged = typedCrypto !== null || draft.marketType !== 'crypto';
  const currencyBlank = (draft.priceCurrency ?? '').trim() === '';
  useEffect(() => {
    if (listedSymbol !== null && listedQuote !== null) {
      if (!currencyBlank && currencyFilledBy === null) return;
      if (currencyFilledBy === listedSymbol && draft.priceCurrency === listedQuote) return;
      setDraft(current => ({ ...current, priceCurrency: listedQuote }));
      setCurrencyFilledBy(listedSymbol);
    } else if (judged && currencyFilledBy !== null) {
      // The next symbol is not a listed market: its currency would be a guess.
      setDraft(current => ({ ...current, priceCurrency: '' }));
      setCurrencyFilledBy(null);
    }
  }, [listedSymbol, listedQuote, judged, currencyBlank, currencyFilledBy, draft.priceCurrency]);
  function chooseSymbol(row: SymbolSearchRow): void {
    setDraft(current => ({ ...current, symbol: row.symbol, marketType: row.marketType }));
    setFeedback(null);
  }
  const symbolNote = typedCrypto?.kind === 'near'
    ? <>On Binance this market is {typedCrypto.symbol}. <Button variant="ghost" size="sm" onClick={() => update('symbol', typedCrypto.symbol)}>Use {typedCrypto.symbol}</Button></>
    : typedCrypto?.kind === 'not-listed' ? typedCrypto.note
    : marketList.phase === 'unavailable' && draft.marketType === 'crypto' && draft.symbol.trim() !== '' ? "The market list is unavailable, so Kairos can't check the symbol. You can still type it."
    : undefined;

  const submitRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (feedback?.kind === 'error') { feedbackRef.current?.focus(); return; }
    // A save disables "Save trade" while it runs, which drops focus to the page: the saved message takes it, unless the
    // trader moved on meanwhile.
    const active = document.activeElement;
    if (feedback?.kind === 'success' && (active === null || active === document.body || active === submitRef.current)) feedbackRef.current?.focus();
  }, [feedback]);

  const showOpenedAt = isQuick || draft.status === 'open' || draft.status === 'closed';
  const checklistMode = isQuick || draft.status === 'closed' || draft.status === 'cancelled' ? 'after' : draft.status === 'draft' || draft.status === 'open' ? 'checklist' : null;
  const showClosedAt = isQuick || draft.status === 'closed';
  // Read only while the box can show (a draft or open trade in All details): when it starts to, and after each save.
  const asksBeforeSave = checklistMode === 'checklist';
  useEffect(() => {
    if (!asksBeforeSave) return;
    let ignore = false;
    void loadBeforeYouSave(db, { scope: beforeSaveScope, now: now().toISOString() }).then(result => { if (!ignore) setBeforeSaveRead(factsRead(result)); });
    return () => { ignore = true; };
  }, [db, beforeSaveScope, beforeSaveReads, asksBeforeSave]);
  const sizesSymbol = asksBeforeSave ? beforeYouSaveSymbol(draft.symbol) : '';
  useEffect(() => {
    if (sizesSymbol === '') return;
    let ignore = false;
    const timer = setTimeout(() => {
      void loadRecentSizes(db, { scope: beforeSaveScope, symbol: sizesSymbol }).then(result => { if (!ignore) setSizesRead(sizesReadFor(sizesSymbol, result)); });
    }, SIZES_READ_PAUSE_MS);
    return () => { ignore = true; clearTimeout(timer); };
  }, [db, beforeSaveScope, sizesSymbol, beforeSaveReads]);
  const sizesForSymbol = sizesRead.symbol === sizesSymbol ? sizesRead : null;
  /** "Try again": both reads again, then the box moves focus once their result is on screen. */
  async function retryBeforeSaveReads(): Promise<void> {
    setRetrying(true);
    const symbol = sizesSymbol;
    const [facts, sizes] = await Promise.all([
      loadBeforeYouSave(db, { scope: beforeSaveScope, now: now().toISOString() }),
      symbol === '' ? null : loadRecentSizes(db, { scope: beforeSaveScope, symbol }),
    ]);
    flushSync(() => {
      setBeforeSaveRead(factsRead(facts));
      if (sizes !== null) setSizesRead(sizesReadFor(symbol, sizes));
      setRetrying(false);
    });
  }
  const beforeSaveNotes = checklistMode === 'checklist' ? previewBeforeYouSave(draft, executions, brokenRules, now().toISOString(), beforeSaveRead.facts, sizesForSymbol?.sizes ?? null) : [];
  const errorField = feedback?.kind === 'error' ? feedback.field : undefined;
  const quickInvalid = (field: QuickTradeLogField): boolean => isQuick && quickTradeLogFieldFor(errorField) === field;
  const fieldError = (field: ManualTradeValidationField): string | undefined => (feedback?.kind === 'error' && feedback.field === field ? feedback.message : undefined);
  const asksContractSize = marketAsksContractSize(draft.marketType);
  // D253: the plan's stop and target. Quick log shows them with the prices; All details keeps them in the plan.
  const stopField = (hint: string | undefined) => <Field label="Planned stop" id={`${planIdPrefix}-stop`} hint={hint} invalid={fieldHasError(feedback, 'plan.plannedStopPrice')}>
    {control => <PriceInput {...control} value={draft.plan.plannedStopPrice} onValueChange={text => updatePlan('plannedStopPrice', text)} />}
  </Field>;
  const targetField = <Field label="Planned target" id={`${planIdPrefix}-target`} invalid={fieldHasError(feedback, 'plan.plannedTargetPrice')}>
    {control => <PriceInput {...control} value={draft.plan.plannedTargetPrice} onValueChange={text => updatePlan('plannedTargetPrice', text)} />}
  </Field>;
  const contractSizeField = asksContractSize ? <Field label="Each point is worth" id={`${idPrefix}-contract-size`} hint={CONTRACT_SIZE_HINT} error={fieldError('contractSize')}>
    {control => <PriceInput {...control} name="contractSize" value={draft.contractSize ?? ''} onValueChange={text => update('contractSize', text)} />}
  </Field> : null;
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

  function updateQuick(field: keyof QuickTradeLogDraft, value: string): void {
    setQuick((current) => ({ ...current, [field]: value }));
    setFeedback(null);
  }

  function chooseMode(next: TradeFormMode): void {
    setMode(next);
    writeTradeFormMode(next);
    setFeedback(null);
  }

  /** In quick log, errors about the entry or exit row name the quick field instead. */
  function quickMessage(field: string | undefined): string | null {
    if (!isQuick) return null;
    const quickField = quickTradeLogFieldFor(field);
    return quickField ? QUICK_MESSAGES[quickField] : null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (isSaving) return;
    setFeedback(null);

    // Quick log saves only what it shows: "Where you traded" and "Leverage" live in All details, like its entries and fees.
    const base = prepareManualTradeSubmission(isQuick ? { ...draft, status: 'closed', exchange: '', leverage: '' } : draft);
    const prepared = !base.ok ? base : isQuick
      ? prepareManualTradeExecutionDetails(base.input, quickTradeLogRows(quick, draft.openedAt, draft.closedAt), [])
      : prepareManualTradeExecutionDetails(base.input, executions, fees);
    if (!prepared.ok) {
      setFeedback({
        kind: 'error',
        field: prepared.field,
        message: quickMessage(prepared.field) ?? (prepared.type === 'execution-draft-invalid' ? prepared.message
          : prepared.type === 'forex-pair' || prepared.type === 'forex-price-currency' ? forexMessage(prepared)
          : prepared.type === 'stock-ticker' ? STOCK_TICKER_MESSAGES[prepared.reason]
          : requiredSelectionMessage(prepared.field)),
      });
      return;
    }

    // What was ticked before the trade goes with it in one write (D241); nothing ticked saves no checklist.
    const discipline: TradeDisciplineParts = {
      ...(checklistMode === 'checklist' && checklistAnswers.length > 0 ? { checklist: checklistAnswers } : {}),
      ...(strategyId !== '' ? { strategy: { strategyId, answers: strategyAnswers } } : {}),
      // What "Before you save" named, as the trader saw it, with their reason; nothing when it named nothing.
      ...(beforeSaveNotes.length > 0 ? { beforeSave: { notes: beforeSaveNotes.map(note => note.kind), reason: saveAnywayReason.trim() || null } } : {}),
    };
    setIsSaving(true);
    const input = { ...prepared.input, discipline };
    const result = kind === 'practice' ? await savePracticeTrade(db, input) : await saveManualTrade(db, input);

    if (!result.ok) {
      setIsSaving(false);
      if (result.type === 'validation-error') {
        setFeedback({
          kind: 'error',
          field: result.field,
          message: quickMessage(result.field) ?? validationMessage(text, result.field, result.reason),
        });
        return;
      }
      setFeedback({ kind: 'error', message: text.storageError });
      return;
    }

    const saved = text.saved;
    setIsSaving(false);

    // Commit the reset and the success banner before the page refreshes its lists.
    flushSync(() => {
      emptyForm();
      setBeforeSaveReads(current => current + 1);
      setFeedback({ kind: 'success', message: saved });
    });
    await keptDraft.clear();
    await onSaved(result.tradeId);
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

      {keptShown ? <p className="kairos-trade-form__kept">Kairos kept the trade you were typing. <Button variant="ghost" size="sm" onClick={startOver}>Start over</Button></p> : null}

      <form className="kairos-trade-form" onSubmit={handleSubmit} noValidate>
        <Segmented label="How to log this trade" value={mode} onChange={chooseMode}
          options={[{ value: 'quick', label: 'Quick log' }, { value: 'full', label: 'All details' }]} />
        {isQuick ? <p className="kairos-trade-form__section-copy">Quick log saves a closed trade with one entry and one exit of the same quantity, and no fees. For partial exits or fees, choose All details.</p> : null}
        <fieldset className="kairos-trade-form__section" disabled={isSaving}>
          <legend>{text.legend}</legend>
          <div className="kairos-trade-form__grid">
            <Field label="Symbol" id={`${idPrefix}-symbol`} required wide invalid={fieldHasError(feedback, 'symbol')} hint={symbolNote}>
              {control => <SymbolSearchField control={control} value={draft.symbol} marketType={draft.marketType} markets={markets} names={coinNames} searchable={searchable}
                onType={text => update('symbol', text)} onChoose={chooseSymbol} />}
            </Field>

            <Field label="Market" id={`${idPrefix}-market`} required invalid={fieldHasError(feedback, 'marketType')}>
              {control => <Select
                {...control}
                name="marketType"
                value={draft.marketType}
                onChange={(event) => update('marketType', event.target.value as ManualTradeDraft['marketType'])}
                placeholder="Choose market"
                options={MARKET_OPTIONS.map(([value, label]) => ({ value, label }))}
              />}
            </Field>

            <Field label="Direction" id={`${idPrefix}-side`} required invalid={fieldHasError(feedback, 'side')}>
              {control => <Select
                {...control}
                name="side"
                value={draft.side}
                onChange={(event) => update('side', event.target.value as ManualTradeDraft['side'])}
                placeholder="Choose direction"
                options={SIDE_OPTIONS.map(([value, label]) => ({ value, label }))}
              />}
            </Field>

            {isQuick ? <>
              <Field label="Entry price" id={`${idPrefix}-entry-price`} required invalid={quickInvalid('entryPrice')}>
                {control => <PriceNowInput input={{ ...control, name: 'entryPrice' }} value={quick.entryPrice} onValueChange={text => updateQuick('entryPrice', text)} marketType={draft.marketType} symbol={draft.symbol} fills="the entry price" pairedTime={draft.openedAt} />}
              </Field>
              <Field label="Exit price" id={`${idPrefix}-exit-price`} required invalid={quickInvalid('exitPrice')}>
                {control => <PriceNowInput input={{ ...control, name: 'exitPrice' }} value={quick.exitPrice} onValueChange={text => updateQuick('exitPrice', text)} marketType={draft.marketType} symbol={draft.symbol} fills="the exit price" pairedTime={draft.closedAt} />}
              </Field>
              {stopField(draft.plan.plannedStopPrice.trim() === '' ? QUICK_NO_STOP_HINT : undefined)}
              {targetField}
              <Field label="Quantity" id={`${idPrefix}-quantity`} required invalid={quickInvalid('quantity')} hint={draft.marketType === 'forex' ? forexQuantityHint(draft.symbol, quick.quantity) ?? undefined : draft.marketType === 'stock' ? STOCK_QUANTITY_HINT : undefined}>
                {control => <PriceInput {...control} name="quantity" value={quick.quantity} onValueChange={text => updateQuick('quantity', text)} />}
              </Field>
              {contractSizeField}
            </> : (
              <Field label="Status" id={`${idPrefix}-status`} required wide hint={statusHint} invalid={fieldHasError(feedback, 'status') || fieldHasError(feedback, 'trade')}>
              {control => <Select
                {...control}
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
                placeholder="Choose status"
                options={STATUS_OPTIONS.map(([value, label]) => ({ value, label }))}
              />}
            </Field>
            )}

            {showOpenedAt ? (
              <Field label="Opened" id={`${idPrefix}-opened-at`} required invalid={fieldHasError(feedback, 'trade') || quickInvalid('openedAt')}>
                {control => <><div className="kairos-trade-form__time">
                  <input
                    {...control}
                    name="openedAt"
                    type="datetime-local"
                    value={draft.openedAt}
                    onChange={(event) => update('openedAt', event.target.value)}
                  />
                  {isQuick ? <Button variant="ghost" size="sm" aria-label="Set opened time to now" onClick={() => update('openedAt', localDateTimeValue(now()))}>Now</Button> : null}
                </div>
                <MarketMinuteLink marketType={draft.marketType} symbol={draft.symbol} localTime={draft.openedAt} id={`${idPrefix}-opened-at`} of="opened" /></>}
              </Field>
            ) : null}

            {showClosedAt ? (
              <Field label="Closed" id={`${idPrefix}-closed-at`} required invalid={fieldHasError(feedback, 'trade') || quickInvalid('closedAt')}>
                {control => <><div className="kairos-trade-form__time">
                  <input
                    {...control}
                    name="closedAt"
                    type="datetime-local"
                    value={draft.closedAt}
                    onChange={(event) => update('closedAt', event.target.value)}
                  />
                  {isQuick ? <Button variant="ghost" size="sm" aria-label="Set closed time to now" onClick={() => update('closedAt', localDateTimeValue(now()))}>Now</Button> : null}
                </div>
                <MarketMinuteLink marketType={draft.marketType} symbol={draft.symbol} localTime={draft.closedAt} id={`${idPrefix}-closed-at`} of="closed" /></>}
              </Field>
            ) : null}
          </div>
          {draft.marketType === 'forex' ? <ForexTradeNote symbol={draft.symbol} /> : null}
          {draft.marketType === 'stock' ? <StockTradeNote symbol={draft.symbol} priceCurrency={draft.priceCurrency ?? ''} /> : null}
        </fieldset>

        <JournalPriceCurrencyField value={draft.priceCurrency ?? ''} onChange={value => { update('priceCurrency', value); setCurrencyFilledBy(null); }} disabled={isSaving}
          filledFrom={currencyFilledBy !== null && listedQuote !== null && draft.priceCurrency === listedQuote ? { symbol: currencyFilledBy, currency: listedQuote } : null} error={feedback?.kind === 'error' && feedback.field === 'grossPnlCurrency' ? feedback.message : undefined} />
        {isQuick ? null : <fieldset className="kairos-trade-form__section" disabled={isSaving}>
          <legend>More about this trade</legend>
          <div className="kairos-trade-form__grid">
            {contractSizeField}
            <Field label="Where you traded" id={`${idPrefix}-exchange`} hint="Optional. Such as Binance, CME or your broker." error={fieldError('exchange')}>
              {control => <input {...control} name="exchange" value={draft.exchange ?? ''} onChange={event => update('exchange', event.target.value)} autoComplete="off" />}
            </Field>
            <Field label="Leverage" id={`${idPrefix}-leverage`} hint="Optional. For example 10 for 10×." error={fieldError('leverage')}>
              {control => <PriceInput {...control} name="leverage" value={draft.leverage ?? ''} onValueChange={text => update('leverage', text)} />}
            </Field>
          </div>
        </fieldset>}
        {isQuick ? null : <>
          <JournalExecutionFields
            key={formGeneration}
            executions={executions} fees={fees} marketType={draft.marketType} symbol={draft.symbol}
            onExecutionsChange={rows => { setExecutions(rows); setFeedback(null); }}
            onFeesChange={rows => { setFees(rows); setFeedback(null); }}
            canAddExecution={draft.status === 'open' || draft.status === 'closed'} disabled={isSaving}
            errorField={errorField}
          />

          <JournalClosedTradeGuidance status={draft.status} types={executions.map(row => row.type)} />
        </>}

        <TradeTagsField id={`${idPrefix}-tags`} value={draft.tags ?? ''} onChange={value => update('tags', value)} error={fieldError('tags')} disabled={isSaving} />

        <details className="kairos-trade-form__optional" open={(feedback?.kind === 'error' && feedback.field?.startsWith('plan.')) || planShown || undefined}>
          <summary>Trade plan · Optional</summary>
        <fieldset className="kairos-trade-form__section" disabled={isSaving}>
          <legend>Trade plan <span>Optional</span></legend>
          <p className="kairos-trade-form__section-copy">Use the numbers you planned before or during the trade. Your plan stays separate from actual entries and exits.</p>
          <div className="kairos-trade-form__grid">
            <Field label="Why I'm taking it" id={`${planIdPrefix}-reason`} wide hint="Optional. Up to 500 letters." error={fieldError('plan.reason')}>
              {control => <textarea {...control} name="reason" rows={3} value={draft.plan.reason ?? ''} onChange={event => updatePlan('reason', event.target.value)} />}
            </Field>
            <Field label="Planned entry" id={`${planIdPrefix}-entry`} invalid={fieldHasError(feedback, 'plan.plannedEntryPrice')}>
              {control => <PriceInput {...control} value={draft.plan.plannedEntryPrice} onValueChange={text => updatePlan('plannedEntryPrice', text)} />}
            </Field>
            {isQuick ? null : <>{stopField(undefined)}{targetField}</>}
            <Field label="Planned quantity" id={`${planIdPrefix}-quantity`} invalid={fieldHasError(feedback, 'plan.plannedQuantity')}>
              {control => <PriceInput {...control} value={draft.plan.plannedQuantity} onValueChange={text => updatePlan('plannedQuantity', text)} />}
            </Field>
          </div>
        </fieldset>

        </details>

        <TradeStrategyField db={db} idPrefix={idPrefix} value={strategyId} onChange={value => { setStrategyId(value); setStrategyAnswers([]); setFeedback(null); }} draft={draft} status={isQuick ? 'closed' : draft.status} disabled={isSaving}
          answers={strategyAnswers} onAnswersChange={answers => { setStrategyAnswers(answers); setFeedback(null); }} checklist={checklistMode === 'checklist' ? checklistAnswers : null} onBrokenRulesChange={setBrokenRules} />

        <BeforeYouTradeField db={db} idPrefix={idPrefix} mode={checklistMode} answers={checklistAnswers} onAnswersChange={answers => { setChecklistAnswers(answers); setFeedback(null); }} disabled={isSaving} />

        {checklistMode === 'checklist' ? <BeforeYouSaveBox idPrefix={idPrefix} notes={beforeSaveNotes} readsFailed={beforeSaveRead.failed || sizesForSymbol?.failed === true} retrying={retrying}
          onRetry={retryBeforeSaveReads} reason={saveAnywayReason} onReasonChange={value => { setSaveAnywayReason(value); setFeedback(null); }} disabled={isSaving} afterRef={submitRef} /> : null}

        <div className="kairos-trade-form__actions">
          <Button ref={submitRef} type="submit" busy={isSaving} emphasis="main" aria-describedby={strategyId ? `${idPrefix}-strategy-note` : undefined}>{isSaving ? 'Saving…' : text.submit}</Button>
        </div>
      </form>
    </>
  );
}
