/**
 * P33: the one owner of trade results in the home currency, for totals. It never changes a trade or its recorded result:
 * totals get a copy of each history entry whose result is converted by the currency owner with the rate of the UTC day the
 * trade closed. A result it cannot convert keeps its own currency, so a total that mixes it says 'different currencies'
 * (the aggregation owner), and its missing rate is listed. With no home currency chosen, the entries are returned as they are.
 */

import type { KairosDatabase } from '../../data/database';
import { convertCurrencyAmount, type CurrencyConversionStep, type ExchangeRateRecord } from '../../domain/calculations/currencyConversion';
import type { DecimalString } from '../../domain/trades';
import { listJournalClosedTradesInPeriod } from '../journal/closedTradePeriodQuery';
import type { JournalHistoryEntry } from '../journal/historyQuery';
import { projectVisualPnlDayKey } from '../visual-pnl/dayBucket';
import { listExchangeRatesForDays } from './exchangeRates';
import { loadHomeCurrency, type HomeCurrencyPreference } from './homeCurrency';

export interface MissingExchangeRate { readonly from: string; readonly to: string; readonly day: string; readonly trades: number }
export type TradeResultInHomeCurrency =
  | Readonly<{ kind: 'home' }>
  | Readonly<{ kind: 'converted'; amount: DecimalString; currency: string; day: string; steps: readonly CurrencyConversionStep[] }>
  | Readonly<{ kind: 'missing-rate'; from: string; to: string; day: string }>
  | Readonly<{ kind: 'not-convertible' }>;
export interface ResultsInHomeCurrencySummary {
  /** null: no home currency chosen, nothing converted. */
  readonly homeCurrency: string | null;
  readonly convertedTrades: number;
  /** The trades whose result is 'missing-rate'. */
  readonly tradesMissingRate: number;
  /** One per pair and day, newest day first, then `from`. */
  readonly missing: readonly MissingExchangeRate[];
}
export interface ResultsInHomeCurrency extends ResultsInHomeCurrencySummary {
  readonly entries: readonly JournalHistoryEntry[];
  readonly byTrade: Readonly<Record<string, TradeResultInHomeCurrency>>;
}

/** The day a trade's result is converted on: the UTC calendar day it closed (D112). */
export function exchangeRateDayOf(entry: JournalHistoryEntry): string | null {
  const day = projectVisualPnlDayKey(entry.trade.closedAt, 'UTC');
  return day.available ? day.dayKey : null;
}

const HOME = Object.freeze({ kind: 'home' as const });
const NOT_CONVERTIBLE = Object.freeze({ kind: 'not-convertible' as const });

/** Each entry's result in the home currency, with the missing rates and their trade counts. Pure. */
export function projectResultsInHomeCurrency(entries: readonly JournalHistoryEntry[], preference: HomeCurrencyPreference | null, rates: readonly ExchangeRateRecord[]): ResultsInHomeCurrency {
  if (preference === null) {
    return Object.freeze({ homeCurrency: null, convertedTrades: 0, tradesMissingRate: 0, missing: Object.freeze([]), entries, byTrade: Object.freeze({}) });
  }
  const byTrade: Record<string, TradeResultInHomeCurrency> = {};
  const missing = new Map<string, { from: string; to: string; day: string; trades: number }>();
  let convertedTrades = 0;
  let tradesMissingRate = 0;
  const converted = entries.map((entry) => {
    const { amount, currency } = entry.visualPnl;
    const id = entry.trade.id;
    if (amount === null || !currency) { byTrade[id] = NOT_CONVERTIBLE; return entry; }
    if (currency === preference.currency) { byTrade[id] = HOME; return entry; }
    const day = entry.trade.status === 'closed' ? exchangeRateDayOf(entry) : null;
    if (day === null) { byTrade[id] = NOT_CONVERTIBLE; return entry; }
    const result = convertCurrencyAmount({ amount, currency, day, target: preference.currency, usdStablecoins: preference.usdStablecoins, rates });
    if (result.ok) {
      convertedTrades += 1;
      byTrade[id] = Object.freeze({ kind: 'converted' as const, amount: result.amount, currency: result.currency, day, steps: result.steps });
      return Object.freeze({ ...entry, visualPnl: Object.freeze({ ...entry.visualPnl, amount: result.amount, currency: result.currency }) });
    }
    if (result.reason === 'missing-rate') {
      tradesMissingRate += 1;
      byTrade[id] = Object.freeze({ kind: 'missing-rate' as const, from: result.from, to: result.to, day });
      const key = `${result.from}\u0000${result.to}\u0000${day}`;
      const known = missing.get(key);
      if (known) known.trades += 1;
      else missing.set(key, { from: result.from, to: result.to, day, trades: 1 });
      return entry;
    }
    byTrade[id] = NOT_CONVERTIBLE;
    return entry;
  });
  const missingList = [...missing.values()]
    .sort((left, right) => right.day.localeCompare(left.day) || left.from.localeCompare(right.from) || left.to.localeCompare(right.to))
    .map((item) => Object.freeze({ ...item }));
  return Object.freeze({
    homeCurrency: preference.currency,
    convertedTrades,
    tradesMissingRate,
    missing: Object.freeze(missingList),
    entries: Object.freeze(converted),
    byTrade: Object.freeze(byTrade),
  });
}

/** Reads the home currency and only the rates of the days that need converting, then projects. */
export async function loadResultsInHomeCurrency(db: KairosDatabase, entries: readonly JournalHistoryEntry[]): Promise<ResultsInHomeCurrency> {
  const preference = await loadHomeCurrency(db);
  if (preference === null) return projectResultsInHomeCurrency(entries, null, []);
  const days = new Set<string>();
  for (const entry of entries) {
    const currency = entry.visualPnl.currency;
    if (!currency || currency === preference.currency) continue;
    const day = exchangeRateDayOf(entry);
    if (day !== null) days.add(day);
  }
  const rates = days.size === 0 ? [] : await listExchangeRatesForDays(db, [...days]);
  return projectResultsInHomeCurrency(entries, preference, rates);
}

export function summarizeResultsInHomeCurrency(value: ResultsInHomeCurrencySummary): ResultsInHomeCurrencySummary {
  return Object.freeze({ homeCurrency: value.homeCurrency, convertedTrades: value.convertedTrades, tradesMissingRate: value.tradesMissingRate, missing: value.missing });
}

/** Every closed trade of both scopes, all time, in the home currency: the rates still missing, for the Currency page. */
export async function loadMissingExchangeRates(db: KairosDatabase): Promise<ResultsInHomeCurrencySummary> {
  const [real, practice] = await Promise.all([
    listJournalClosedTradesInPeriod(db, { timeZone: 'UTC', fromDayKey: null, toDayKey: null, scope: 'real' }),
    listJournalClosedTradesInPeriod(db, { timeZone: 'UTC', fromDayKey: null, toDayKey: null, scope: 'practice' }),
  ]);
  // The all-time period never refuses: it has no day keys to check.
  const entries = [...(real.ok ? real.entries : []), ...(practice.ok ? practice.entries : [])];
  return summarizeResultsInHomeCurrency(await loadResultsInHomeCurrency(db, entries));
}
