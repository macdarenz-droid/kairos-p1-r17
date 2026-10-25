import type { KairosDatabase } from '../../data/database';
import { loadResultsInHomeCurrency, summarizeResultsInHomeCurrency, type ResultsInHomeCurrencySummary } from '../currency/resultsInHomeCurrency';
import { describePeriodMoneyUnavailable } from '../performance/periodWords';
import { signedText } from '../performance/tradeRisk';
import { summarizeVisualPnlAggregation, type VisualPnlAggregationSummary } from '../visual-pnl/aggregationSummary';
import { listAllJournalMatches, type JournalHistoryScope } from './historyQuery';
import type { JournalFilters } from './journalFilters';

/** U15 (D262): what every trade matching the filters adds up to, not only the rows on screen. */
export interface JournalTotals {
  readonly trades: number;
  readonly won: number;
  readonly lost: number;
  /** The closed trades' results after fees, in the home currency where one is chosen; refused when they can't be added. */
  readonly result: VisualPnlAggregationSummary;
  /** What the home currency could not convert (the rates still missing). */
  readonly inHome: ResultsInHomeCurrencySummary;
}

/**
 * Reads every trade matching the filters once, counts them, and how many closed trades won and lost, and adds the
 * closed trades' results after fees through the home-currency owner. A result it cannot convert is left in its own
 * currency, so the sum is refused and says why: never added as 0.
 */
export async function loadJournalTotals(db: KairosDatabase, scope: JournalHistoryScope, filters: JournalFilters, timeZone: string): Promise<JournalTotals> {
  const matches = await listAllJournalMatches(db, { scope, filters, timeZone });
  const closed = matches.filter(entry => entry.trade.status === 'closed');
  const inHome = await loadResultsInHomeCurrency(db, closed);
  return Object.freeze({
    trades: matches.length,
    won: closed.filter(entry => entry.visualPnl.outcome === 'profit').length,
    lost: closed.filter(entry => entry.visualPnl.outcome === 'loss').length,
    result: summarizeVisualPnlAggregation(inHome.entries.map(entry => entry.visualPnl)),
    inHome: summarizeResultsInHomeCurrency(inHome),
  });
}

const count = (n: number): string => `${n} ${n === 1 ? 'trade' : 'trades'}`;

/**
 * The totals line: "12 trades · won 5 · lost 7 · result after fees -420 USDT". When the results can't be added it says
 * why ("result after fees: Not available: a trade has no result yet."), and with no closed trade it says none has one.
 */
export function describeJournalTotals(totals: JournalTotals): string {
  const result = totals.result.available
    ? `result after fees ${signedText(totals.result.total)} ${totals.result.currency}`
    : `result after fees: ${describePeriodMoneyUnavailable(totals.result.reason, { homeCurrency: totals.inHome.homeCurrency, tradesMissingRate: totals.inHome.tradesMissingRate })}`;
  return `${count(totals.trades)} · won ${totals.won} · lost ${totals.lost} · ${result}`;
}
