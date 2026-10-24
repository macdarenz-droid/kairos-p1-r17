/**
 * U12 (D242, D244): the one owner of what "Before you save" names for a draft or open trade, in its order, with its words.
 * It never blocks a save (D4). The reads come from `loadBeforeYouSave` (once when the form opens and after each save) and
 * `loadRecentSizes` (for the symbol typed); when they fail, only what the form itself knows is named (no stop, a broken
 * rule), and the caller says the rest could not be checked: never "nothing applies".
 */
import type { KairosDatabase } from '../../data/database';
import { createKairosRepositories } from '../../data/repositories';
import { decimalAdd, decimalCompare, decimalDivide, decimalMultiply } from '../../domain/calculations/decimalKernel';
import type { BeforeYouSaveKind } from '../../domain/discipline';
import { isEconomicEventRecordShape } from '../../domain/economic-calendar/economicEvent';
import { economicEventName, economicEventSize } from '../../domain/economic-calendar/newsImpact';
import { parsePositiveDecimalString, type DecimalString, type TradeStatus } from '../../domain/trades';
import { NEWS_NEAR_TRADE_MINUTES } from '../economic-calendar/newsNearTrades';
import { loadGoalsProgress } from '../goals/loadGoalsProgress';
import { hydrateJournalHistoryEntries, JOURNAL_HISTORY_SOURCES, type JournalHistoryScope } from '../journal/historyQuery';
import type { ManualTradeDraft } from '../trades/manualTradeDraft';
import type { ManualTradeExecutionInput } from '../trades/saveManualTrade';
import { projectVisualPnlDayKey, type VisualPnlOutcome } from '../visual-pnl';

/** A loss closed this recently is named; so is saved big news starting this soon. */
export const BEFORE_YOU_SAVE_MINUTES = NEWS_NEAR_TRADE_MINUTES;
/** D244: the usual size is the median of the last 20 closed trades of the symbol, from at least 5. */
export const USUAL_SIZE_TRADES = 20;
export const USUAL_SIZE_LEAST_TRADES = 5;
/** Saved news is read a day ahead, so a form left open still names news as it comes within BEFORE_YOU_SAVE_MINUTES. */
export const BEFORE_YOU_SAVE_NEWS_READ_AHEAD_MINUTES = 24 * 60;

const MINUTE_MS = 60_000;

/** What the reads found; null where a fact does not apply (no daily limit, no closed trade). */
export interface BeforeYouSaveFacts {
  /** Real trades with a daily limit and a saved time zone: how many were opened today. */
  readonly tradeLimit: Readonly<{ today: number; limit: number; timeZone: string }> | null;
  /** The latest close of the last 30 minutes (or one dated later); null when there is none. */
  readonly lastClosed: Readonly<{ closedAt: string; outcome: VisualPnlOutcome }> | null;
  /** Saved big news starting from the read to a day ahead, in time order; the projection names what starts within BEFORE_YOU_SAVE_MINUTES of its now. */
  readonly upcomingNews: readonly Readonly<{ name: string; startsAt: string }>[];
}

export interface BeforeYouSaveInput {
  readonly status: TradeStatus | '';
  /** As a save writes it (beforeYouSaveSymbol). */
  readonly symbol: string;
  /** An open trade's open time (UTC ISO), or null. */
  readonly openedAt: string | null;
  /** The stop as typed; empty when none. */
  readonly stop: string;
  /** The size as typed and read, or null. */
  readonly size: DecimalString | null;
  /** How many strategy rules the form's check says are broken. */
  readonly brokenRules: number;
  readonly now: string;
  /** null when the reads failed. */
  readonly facts: BeforeYouSaveFacts | null;
  /** The symbol's entered sizes, newest close first (loadRecentSizes); null when not read. */
  readonly recentSizes: readonly DecimalString[] | null;
}

export interface BeforeYouSaveNote { readonly kind: BeforeYouSaveKind; readonly text: string }

/** The symbol as a save writes it, so the sizes read are the ones the journal keeps under it. */
export const beforeYouSaveSymbol = (typed: string): string => typed.trim().toUpperCase();

const minutesWord = (minutes: number) => (minutes === 1 ? '1 minute' : `${minutes} minutes`);

/** D244: the median of the newest sizes, from at least USUAL_SIZE_LEAST_TRADES of them; null otherwise or when a size can't be read. */
export function projectUsualSize(sizes: readonly DecimalString[]): DecimalString | null {
  const recent = sizes.slice(0, USUAL_SIZE_TRADES);
  if (recent.length < USUAL_SIZE_LEAST_TRADES) return null;
  const sorted = [...recent];
  for (const size of sorted) if (decimalCompare(size, '0') === null) return null;
  sorted.sort((a, b) => decimalCompare(a, b) ?? 0);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle]!;
  const sum = decimalAdd(sorted[middle - 1]!, sorted[middle]!);
  const half = sum.ok ? decimalDivide(sum.value, '2') : sum;
  return half.ok ? half.value : null;
}

function counts(input: BeforeYouSaveInput, timeZone: string): boolean {
  if (input.status === 'draft') return true;
  // An open trade counts today only when it was opened today.
  const opened = projectVisualPnlDayKey(input.openedAt, timeZone);
  const today = projectVisualPnlDayKey(input.now, timeZone);
  return opened.available && today.available && opened.dayKey === today.dayKey;
}

/** D242: what applies, in order. Only a draft or open trade is asked; a trade logged after it closed gets nothing. */
export function projectBeforeYouSave(input: BeforeYouSaveInput): readonly BeforeYouSaveNote[] {
  if (input.status !== 'draft' && input.status !== 'open') return Object.freeze([]);
  const notes: BeforeYouSaveNote[] = [];
  const nowMs = Date.parse(input.now);
  const facts = input.facts;

  const limit = facts?.tradeLimit ?? null;
  if (limit !== null && counts(input, limit.timeZone) && limit.today + 1 > limit.limit) {
    notes.push({ kind: 'trade-limit', text: `This would be trade ${limit.today + 1} today. Your most is ${limit.limit}.` });
  }

  const last = facts?.lastClosed ?? null;
  const sinceLoss = last === null ? NaN : nowMs - Date.parse(last.closedAt);
  if (last !== null && last.outcome === 'loss' && sinceLoss >= 0 && sinceLoss <= BEFORE_YOU_SAVE_MINUTES * MINUTE_MS) {
    const minutes = Math.floor(sinceLoss / MINUTE_MS);
    notes.push({ kind: 'recent-loss', text: minutes === 0 ? 'Your last trade was a loss just now.' : `Your last trade was a loss ${minutesWord(minutes)} ago.` });
  }

  if (input.stop.trim() === '') notes.push({ kind: 'no-stop', text: 'No stop is written for this trade.' });

  const news = (facts?.upcomingNews ?? []).filter(item => {
    const at = Date.parse(item.startsAt);
    return at >= nowMs && at - nowMs <= BEFORE_YOU_SAVE_MINUTES * MINUTE_MS;
  });
  if (news.length > 0) {
    const first = news[0]!;
    const minutes = Math.floor((Date.parse(first.startsAt) - nowMs) / MINUTE_MS);
    const more = news.length > 1 ? ` and ${news.length - 1} more` : '';
    notes.push({ kind: 'big-news', text: minutes <= 1 ? `Big news now: ${first.name}${more}.` : `Big news in ${minutes} minutes: ${first.name}${more}.` });
  }

  const usual = input.size === null || input.symbol === '' || input.recentSizes === null ? null : projectUsualSize(input.recentSizes);
  const twice = usual === null ? null : decimalMultiply(usual, '2');
  if (input.size !== null && usual !== null && twice?.ok && decimalCompare(input.size, twice.value) === 1) {
    // The typed size stays out of the words, so the line is not read out again on every digit.
    notes.push({ kind: 'bigger-size', text: `This size is more than twice your usual ${usual} for ${input.symbol}.` });
  }

  if (input.brokenRules > 0) {
    notes.push({ kind: 'rule-broken', text: input.brokenRules === 1 ? "1 of your strategy's rules is broken." : `${input.brokenRules} of your strategy's rules are broken.` });
  }
  return Object.freeze(notes.map(note => Object.freeze(note)));
}

const typedSize = (value: string): DecimalString | null => {
  const parsed = parsePositiveDecimalString(value.trim());
  return parsed.ok ? parsed.value : null;
};

/** An open trade's size is what its entry rows add up to; otherwise (a draft, or no entry rows yet) the planned quantity. Null when unreadable. */
function draftSize(draft: ManualTradeDraft, executions: readonly Pick<ManualTradeExecutionInput, 'type' | 'quantity'>[]): DecimalString | null {
  const entries = draft.status === 'open' ? executions.filter(row => row.type === 'entry') : [];
  if (entries.length === 0) return draft.plan.plannedQuantity.trim() === '' ? null : typedSize(draft.plan.plannedQuantity);
  let total: DecimalString = '0' as DecimalString;
  for (const row of entries) {
    const quantity = typedSize(row.quantity);
    const sum = quantity === null ? null : decimalAdd(total, quantity);
    if (sum === null || !sum.ok) return null;
    total = sum.value;
  }
  return total;
}

/** The form's draft as "Before you save" reads it: the symbol as a save writes it, an open trade's open time and its size. */
export function previewBeforeYouSave(
  draft: ManualTradeDraft,
  executions: readonly Pick<ManualTradeExecutionInput, 'type' | 'quantity'>[],
  brokenRules: number,
  now: string,
  facts: BeforeYouSaveFacts | null,
  recentSizes: readonly DecimalString[] | null,
): readonly BeforeYouSaveNote[] {
  const opened = draft.status === 'open' && draft.openedAt.trim() !== '' ? new Date(draft.openedAt.trim()) : null;
  return projectBeforeYouSave({
    status: draft.status,
    symbol: beforeYouSaveSymbol(draft.symbol),
    openedAt: opened !== null && Number.isFinite(opened.getTime()) ? opened.toISOString() : null,
    stop: draft.plan.plannedStopPrice,
    size: draftSize(draft, executions),
    brokenRules,
    now,
    facts,
    recentSizes,
  });
}

export type LoadBeforeYouSaveResult = Readonly<{ ok: true; facts: BeforeYouSaveFacts }> | Readonly<{ ok: false }>;

/** The reads behind "Before you save" for one scope: the daily trade limit (real trades), the latest close of the last 30 minutes and saved big news. */
export async function loadBeforeYouSave(db: KairosDatabase, options: Readonly<{ scope: JournalHistoryScope; now: string }>): Promise<LoadBeforeYouSaveResult> {
  try {
    const repositories = createKairosRepositories(db);
    const nowMs = Date.parse(options.now);
    const until = new Date(nowMs + BEFORE_YOU_SAVE_NEWS_READ_AHEAD_MINUTES * MINUTE_MS).toISOString();
    const [latest, events, goals] = await Promise.all([
      // Only a close in the last 30 minutes can be named, so only those are read (oldest first).
      repositories.trades.scopedBySource(JOURNAL_HISTORY_SOURCES[options.scope]).listClosedByClosedAtRange(new Date(nowMs - BEFORE_YOU_SAVE_MINUTES * MINUTE_MS).toISOString(), null),
      repositories.economicEvents.listStartingBetween(new Date(nowMs).toISOString(), until),
      // Practice has no goals (D242).
      options.scope === 'real' ? loadGoalsProgress(db, options.now) : Promise.resolve(null),
    ]);
    const [last] = await hydrateJournalHistoryEntries(repositories, latest.slice(-1));
    const progress = goals?.kind === 'ready' && goals.progress.kind === 'ready' ? goals.progress : null;
    const tradeLimit = progress !== null && progress.maxTradesPerDay.kind === 'limit'
      ? Object.freeze({ today: progress.maxTradesPerDay.today, limit: progress.maxTradesPerDay.limit, timeZone: progress.timeZone })
      : null;
    const upcomingNews = events
      .filter(event => isEconomicEventRecordShape(event) && economicEventSize(event).size === 'high')
      .sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt))
      .map(event => Object.freeze({ name: economicEventName(event), startsAt: event.startsAt }));
    return Object.freeze({
      ok: true as const,
      facts: Object.freeze({
        tradeLimit,
        lastClosed: last?.trade.closedAt ? Object.freeze({ closedAt: last.trade.closedAt, outcome: last.visualPnl.outcome }) : null,
        upcomingNews: Object.freeze(upcomingNews),
      }),
    });
  } catch {
    return Object.freeze({ ok: false as const });
  }
}

export type LoadRecentSizesResult = Readonly<{ ok: true; symbol: string; sizes: readonly DecimalString[] }> | Readonly<{ ok: false }>;

/** D244: the entered sizes of the symbol's last USUAL_SIZE_TRADES closed trades in the scope, newest close first. */
export async function loadRecentSizes(db: KairosDatabase, options: Readonly<{ scope: JournalHistoryScope; symbol: string }>): Promise<LoadRecentSizesResult> {
  try {
    const repositories = createKairosRepositories(db);
    const symbol = beforeYouSaveSymbol(options.symbol);
    const latest = await repositories.trades.scopedBySource(JOURNAL_HISTORY_SOURCES[options.scope]).listRecentClosedBySymbol(symbol, USUAL_SIZE_TRADES);
    const entries = await hydrateJournalHistoryEntries(repositories, latest);
    const sizes = entries.map(entry => entry.metrics?.totalEnteredQuantity ?? null).filter((size): size is DecimalString => size !== null && decimalCompare(size, '0') === 1);
    return Object.freeze({ ok: true as const, symbol, sizes: Object.freeze(sizes) });
  } catch {
    return Object.freeze({ ok: false as const });
  }
}
