/**
 * U16 (P21.A1, D270): the one read behind Home's "Your Trades": the real trades closed in the chosen period, by close
 * day in the saved time zone (the period query "Your results" reads, so "Month" holds the trades Today's "This month"
 * counts), newest close first. Each keeps its recorded result after fees and gets the result its bubble compares: in
 * the home currency when one is chosen (as recorded, or converted by `resultsInHomeCurrency`), else in its own currency.
 * It adds up no money, never guesses a time zone or a rate, and writes nothing.
 */

import type { KairosDatabase } from '../../data/database';
import { createKairosRepositories } from '../../data/repositories';
import type { DecimalString, TradeId, TradeSide } from '../../domain/trades';
import type { ResultsInHomeCurrency } from '../currency/resultsInHomeCurrency';
import { JOURNAL_HISTORY_SOURCES, type JournalHistoryEntry } from '../journal/historyQuery';
import { loadPerformancePeriod } from '../performance/loadPerformanceSummary';
import { projectVisualPnlDayKey } from '../visual-pnl/dayBucket';
import type { VisualPnlAmountSource, VisualPnlOutcome, VisualPnlOutcomeProjection } from '../visual-pnl/outcomeProjection';
import { projectVisualPnlPeriod, type VisualPnlPeriod, type VisualPnlPeriodChoice } from '../visual-pnl/resultsPeriod';
import { readVisualPnlTimeZonePreference } from '../visual-pnl/timeZonePreference';

/** The periods Home offers, each ending today: "Week", "Month" (first), "3 months", "Year", "All time". */
export const HOME_YOUR_TRADES_PERIODS = Object.freeze(['week', 'month', 'three-months', 'year', 'all'] as const);
export type HomeYourTradesChoice = Readonly<{ kind: 'week' | 'month' | 'three-months' | 'year'; at: null }> | Readonly<{ kind: 'all' }>;

/** Home's period from a period kept in the address: the same kind ending today; one Home does not offer (custom days) is the default month. */
export function homeYourTradesChoice(choice: VisualPnlPeriodChoice): HomeYourTradesChoice {
  if (choice.kind === 'all') return Object.freeze({ kind: 'all' as const });
  if (choice.kind === 'custom') return Object.freeze({ kind: 'month' as const, at: null });
  return Object.freeze({ kind: choice.kind, at: null });
}

/** What a trade's bubble compares, in one currency for the period's scale. */
export type HomeYourTradeComparison =
  /** In the home currency (`converted`: from the trade's own currency, with the rate of its close day), or, with no home currency, as recorded. */
  | Readonly<{ kind: 'compared'; amount: DecimalString; currency: string; converted: boolean }>
  /** A result that can't be put on the scale: the home currency needs a rate that is missing, or the result has no currency Kairos knows. */
  | Readonly<{ kind: 'not-compared'; reason: 'missing-rate' | 'unknown-currency' }>
  | Readonly<{ kind: 'no-result' }>;

export interface HomeYourTrade {
  readonly id: TradeId;
  readonly symbol: string;
  readonly side: TradeSide;
  readonly outcome: VisualPnlOutcome;
  readonly resultLabel: VisualPnlOutcomeProjection['label'];
  /** The recorded result after fees, in its own currency (null: no result, never 0). */
  readonly amount: DecimalString | null;
  readonly currency: string | null;
  readonly source: VisualPnlAmountSource;
  readonly compared: HomeYourTradeComparison;
  readonly closedAt: string | null;
  /** The close day in the saved zone (YYYY-MM-DD); null when the close time can't be read. */
  readonly closeDayKey: string | null;
}

export type HomeYourTradesResult =
  | Readonly<{ kind: 'time-zone-unconfigured' }>
  | Readonly<{ kind: 'unavailable'; reason: 'invalid-now' | 'invalid-period' | 'invalid-day-key' | 'invalid-time-zone' | 'empty-period' }>
  | Readonly<{
    kind: 'ready';
    timeZone: string;
    todayKey: string;
    period: VisualPnlPeriod;
    /** null: no home currency chosen; each result is compared in its own currency. */
    homeCurrency: string | null;
    /** The period's real closed trades, newest close first. */
    trades: readonly HomeYourTrade[];
    /** Whether the journal holds any real trade at all (planned, open, closed or cancelled). */
    hasTrades: boolean;
  }>;

const NO_RESULT = Object.freeze({ kind: 'no-result' as const });
const notCompared = (reason: 'missing-rate' | 'unknown-currency') => Object.freeze({ kind: 'not-compared' as const, reason });
const compared = (amount: DecimalString, currency: string, converted: boolean) => Object.freeze({ kind: 'compared' as const, amount, currency, converted });

function compare(entry: JournalHistoryEntry, inHome: ResultsInHomeCurrency): HomeYourTradeComparison {
  const { outcome, amount, currency } = entry.visualPnl;
  if (outcome === 'unavailable' || amount === null) return NO_RESULT;
  if (inHome.homeCurrency === null) return currency ? compared(amount, currency, false) : notCompared('unknown-currency');
  const inHomeCurrency = inHome.byTrade[entry.trade.id];
  if (inHomeCurrency?.kind === 'home') return compared(amount, inHome.homeCurrency, false);
  if (inHomeCurrency?.kind === 'converted') return compared(inHomeCurrency.amount, inHomeCurrency.currency, true);
  return notCompared(inHomeCurrency?.kind === 'missing-rate' ? 'missing-rate' : 'unknown-currency');
}

function projectHomeYourTrade(entry: JournalHistoryEntry, inHome: ResultsInHomeCurrency, timeZone: string): HomeYourTrade {
  const { trade, visualPnl } = entry;
  const closedAt = trade.closedAt ?? null;
  const day = projectVisualPnlDayKey(closedAt, timeZone);
  return Object.freeze({
    id: trade.id, symbol: trade.symbol, side: trade.side,
    outcome: visualPnl.outcome, resultLabel: visualPnl.label, amount: visualPnl.amount, currency: visualPnl.currency, source: visualPnl.source,
    compared: compare(entry, inHome),
    closedAt,
    closeDayKey: day.available ? day.dayKey : null,
  });
}

/** "Your Trades" for `choice` at the moment `now`. A refusal is a result, never a throw; a storage failure rejects. */
export async function loadHomeYourTrades(db: KairosDatabase, options: Readonly<{ choice: VisualPnlPeriodChoice; now: string }>): Promise<HomeYourTradesResult> {
  const repositories = createKairosRepositories(db);
  // Each bubble names its close day, so the read needs the zone even for all time.
  const timeZone = await readVisualPnlTimeZonePreference(repositories.metadata);
  if (timeZone === null) return Object.freeze({ kind: 'time-zone-unconfigured' as const });
  const today = projectVisualPnlDayKey(options.now, timeZone);
  if (!today.available) return Object.freeze({ kind: 'unavailable' as const, reason: 'invalid-now' as const });
  const projected = projectVisualPnlPeriod(options.choice, today.dayKey);
  if (!projected.ok) return Object.freeze({ kind: 'unavailable' as const, reason: 'invalid-period' as const });
  const { period } = projected;

  const read = await loadPerformancePeriod(db, { timeZone, fromDayKey: period.fromDayKey, toDayKey: period.toDayKey, scope: 'real' });
  if (read.kind === 'unavailable') return Object.freeze({ kind: 'unavailable' as const, reason: read.reason });
  // The period query gives the oldest close first; Home lists the newest first, as the Journal does.
  const trades = read.recorded.map(entry => projectHomeYourTrade(entry, read.inHome, timeZone)).reverse();
  const hasTrades = trades.length > 0 || (await repositories.trades.scopedBySource(JOURNAL_HISTORY_SOURCES.real).listPageByJournalAt(null, null, 1)).length > 0;
  return Object.freeze({
    kind: 'ready' as const,
    timeZone,
    todayKey: today.dayKey,
    period,
    homeCurrency: read.inHome.homeCurrency,
    trades: Object.freeze(trades),
    hasTrades,
  });
}
