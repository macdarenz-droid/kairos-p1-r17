/**
 * U5 (P13.A4, D202): the plain words for the period numbers ("Your results"). Every number comes from its owner as given
 * (`summarizePerformance`, the aggregation owner); these functions only put it in plain words (the ROADMAP "Plain words"
 * list and D194). They never work a number out.
 */

import { decimalAbs, decimalCompare } from '../../domain/calculations/decimalKernel';
import type { VisualPnlAggregationBlockReason } from '../visual-pnl/aggregationEligibility';
import type { PerformanceDip, PerformanceMoneyReason, PerformanceRatio, PerformanceStreak, PerformanceTime, TradeOutcomeSummary } from './performanceSummary';
import { describeTradeDuration } from './tradeDuration';

/** The home-currency facts that change the words of 'mixed-currencies'; the dashboard passes its `inHomeCurrency`. */
export type PeriodMoneyContext = Readonly<{ homeCurrency: string | null; tradesMissingRate: number }>;

const NO_RESULT_YET = 'No trade with a result yet';
const trades = (count: number): string => `${count} ${count === 1 ? 'trade' : 'trades'}`;

/** "Won 7 of 12 (58% won) · 1 trade has no result yet". */
export function describeWonLost(outcomes: TradeOutcomeSummary): string {
  if (outcomes.resultCount === 0) return NO_RESULT_YET;
  const share = outcomes.enough && outcomes.wonPercent !== null ? ` (${outcomes.wonPercent}% won)` : '';
  const noResult = outcomes.noResult === 0 ? '' : ` · ${trades(outcomes.noResult)} ${outcomes.noResult === 1 ? 'has' : 'have'} no result yet`;
  return `Won ${outcomes.won} of ${outcomes.resultCount}${share}${noResult}`;
}

/** "from 1 trade", "from 12 trades". */
export function describeTradeCount(count: number): string {
  return `from ${trades(count)}`;
}

/** Why a money number of the period is not given. */
export function describePeriodMoneyUnavailable(reason: PerformanceMoneyReason | VisualPnlAggregationBlockReason | 'invalid-aggregate-decimal', context?: PeriodMoneyContext): string {
  switch (reason) {
    case 'no-trades':
      return NO_RESULT_YET;
    case 'mixed-currencies': {
      const home = context?.homeCurrency ?? null;
      if (home === null) return 'Not available: your trades are in different currencies. Choose a home currency to add them up.';
      const missing = context?.tradesMissingRate ?? 0;
      if (missing === 0) return `Not available: a trade could not be converted to ${home}.`;
      return `Not available: ${trades(missing)} still ${missing === 1 ? 'needs' : 'need'} an exchange rate to count in ${home}.`;
    }
    case 'missing-currency-evidence':
      return 'Not available: a trade has no currency.';
    case 'unavailable-trade-outcome':
      return 'Not available: a trade has no result yet.';
    default:
      return 'Not available.';
  }
}

/** The words of an unavailable average win, average loss or average result. */
export function describeAverageUnavailable(which: 'win' | 'loss' | 'result', reason: PerformanceMoneyReason, context?: PeriodMoneyContext): string {
  if (reason !== 'no-trades') return describePeriodMoneyUnavailable(reason, context);
  if (which === 'win') return 'No winning trade in this period';
  if (which === 'loss') return 'No losing trade in this period';
  return NO_RESULT_YET;
}

/** "You made 1.5 for every 1 you lost". */
export function describeProfitFactor(ratio: PerformanceRatio, context?: PeriodMoneyContext): string {
  if (ratio.available) return `You made ${ratio.shown} for every 1 you lost`;
  if (ratio.reason === 'no-losses') return 'No losses in this period';
  if (ratio.reason === 'no-trades') return 'Needs a win or a loss';
  return describePeriodMoneyUnavailable(ratio.reason, context);
}

/** "On average you make 0.4× what you risk". */
export function describeAverageTimesRisked(ratio: PerformanceRatio): string {
  if (!ratio.available) return ratio.reason === 'no-trades' ? 'Needs trades with a stop and a result' : 'Not available.';
  // The sentence follows the number shown: a value that rounds to 0 reads as break-even, never "0×" (D211).
  const sign = decimalCompare(ratio.shown, '0');
  if (sign === null) return 'Not available.';
  if (sign === 0) return 'On average you break even on what you risk';
  if (sign > 0) return `On average you make ${ratio.shown}× what you risk`;
  const size = decimalAbs(ratio.shown);
  return size.ok ? `On average you lose ${size.value}× what you risk` : 'Not available.';
}

/** "2 h", with the trades left out because their times can't be right. */
export function describeAverageTime(time: PerformanceTime): string {
  if (!time.available) return 'Needs a trade with a start and an end';
  const bad = time.tradesWithBadTimes;
  const leftOut = bad === 0 ? '' : bad === 1 ? ' · 1 trade left out: its exit is before its entry' : ` · ${bad} trades left out: their exits are before their entries`;
  return `${describeTradeDuration(time.averageMs)}${leftOut}`;
}

/** "30 USDT", the exact amount; or that the total never fell. */
export function describeBiggestDip(dip: PerformanceDip, context?: PeriodMoneyContext): string {
  if (!dip.available) return describePeriodMoneyUnavailable(dip.reason, context);
  if (decimalCompare(dip.amount, '0') === 0) return 'No dip: your total never fell below a high point';
  return `${dip.amount} ${dip.currency}`;
}

/** "3 in a row". */
export function describeStreakLength(streak: PerformanceStreak): string {
  return streak.available ? `${streak.length} in a row` : 'Needs a trade with a result';
}
