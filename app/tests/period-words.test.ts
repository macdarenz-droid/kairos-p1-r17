import { describe, expect, it } from 'vitest';
import {
  describeAverageTime,
  describeAverageTimesRisked,
  describeAverageUnavailable,
  describeBiggestDip,
  describePeriodMoneyUnavailable,
  describeProfitFactor,
  describeStreakLength,
  describeTradeCount,
  describeWonLost,
} from '../src/application/performance/periodWords';
import type { PerformanceDip, PerformanceRatio, PerformanceStreak, PerformanceTime, TradeOutcomeSummary } from '../src/application/performance/performanceSummary';
import type { DecimalString } from '../src/domain/trades';

const d = (value: string) => value as DecimalString;
function outcomes(won: number, lost: number, breakEven = 0, noResult = 0, wonPercent: number | null = null): TradeOutcomeSummary {
  const resultCount = won + lost + breakEven;
  return { tradeCount: resultCount + noResult, won, lost, breakEven, noResult, resultCount, enough: resultCount >= 10, wonPercent };
}
const ratio = (value: string, shown = value): PerformanceRatio => ({ available: true, value: d(value), shown: d(shown), tradeCount: 4 });
const EUR_ONE = { homeCurrency: 'EUR', tradesMissingRate: 1 };

describe('T-051b the words for your numbers', () => {
  it('says how many trades won', () => {
    expect(describeWonLost(outcomes(7, 5, 0, 0, 58))).toBe('Won 7 of 12 (58% won)');
    expect(describeWonLost(outcomes(3, 6))).toBe('Won 3 of 9');
    expect(describeWonLost(outcomes(3, 6, 0, 2))).toBe('Won 3 of 9 · 2 trades have no result yet');
    expect(describeWonLost(outcomes(3, 6, 0, 1))).toBe('Won 3 of 9 · 1 trade has no result yet');
    expect(describeWonLost(outcomes(0, 0))).toBe('No trade with a result yet');
  });

  it('counts the trades a number rests on', () => {
    expect(describeTradeCount(1)).toBe('from 1 trade');
    expect(describeTradeCount(12)).toBe('from 12 trades');
  });

  it('says what you made for every 1 you lost', () => {
    expect(describeProfitFactor(ratio('1.5'))).toBe('You made 1.5 for every 1 you lost');
    expect(describeProfitFactor({ available: false, reason: 'no-losses', tradeCount: 3 })).toBe('No losses in this period');
    expect(describeProfitFactor({ available: false, reason: 'no-trades', tradeCount: 0 })).toBe('Needs a win or a loss');
    expect(describeProfitFactor({ available: false, reason: 'mixed-currencies', tradeCount: 3 }, EUR_ONE)).toBe('Not available: 1 trade still needs an exchange rate to count in EUR.');
  });

  it('says what you make for what you risk, with its sign', () => {
    expect(describeAverageTimesRisked(ratio('0.4'))).toBe('On average you make 0.4× what you risk');
    expect(describeAverageTimesRisked(ratio('-0.35'))).toBe('On average you lose 0.35× what you risk');
    expect(describeAverageTimesRisked(ratio('0'))).toBe('On average you break even on what you risk');
    expect(describeAverageTimesRisked(ratio('0.004', '0'))).toBe('On average you break even on what you risk');
    expect(describeAverageTimesRisked(ratio('-0.004', '0'))).toBe('On average you break even on what you risk');
    expect(describeAverageTimesRisked({ available: false, reason: 'no-trades', tradeCount: 0 })).toBe('Needs trades with a stop and a result');
  });

  it('says the average time in a trade, and the trades left out', () => {
    const time = (tradesWithBadTimes: number): PerformanceTime => ({ available: true, averageMs: 7_200_000, tradeCount: 3, tradesWithBadTimes });
    expect(describeAverageTime(time(0))).toBe('2 h');
    expect(describeAverageTime(time(1))).toBe('2 h · 1 trade left out: its exit is before its entry');
    expect(describeAverageTime(time(2))).toBe('2 h · 2 trades left out: their exits are before their entries');
    expect(describeAverageTime({ available: false, reason: 'no-trades', tradeCount: 0, tradesWithBadTimes: 0 })).toBe('Needs a trade with a start and an end');
  });

  it('says the biggest dip, or that there was none', () => {
    const dip = (amount: string): PerformanceDip => ({ available: true, amount: d(amount), currency: 'USDT', fromTradeId: null, toTradeId: null, tradeCount: 4 });
    expect(describeBiggestDip(dip('0'))).toBe('No dip: your total never fell below a high point');
    expect(describeBiggestDip(dip('30'))).toBe('30 USDT');
    expect(describeBiggestDip({ available: false, reason: 'unavailable-trade-outcome', tradeCount: 4 })).toBe('Not available: a trade has no result yet.');
  });

  it('says how many in a row', () => {
    const streak = (length: number): PerformanceStreak => ({ available: true, length, firstTradeId: null, lastTradeId: null, tradeCount: 5, tradesWithoutResult: 0 });
    expect(describeStreakLength(streak(3))).toBe('3 in a row');
    expect(describeStreakLength(streak(1))).toBe('1 in a row');
    expect(describeStreakLength(streak(0))).toBe('0 in a row');
    expect(describeStreakLength({ available: false, reason: 'no-trades', tradeCount: 0, tradesWithoutResult: 0 })).toBe('Needs a trade with a result');
  });

  it('says why a money number is not given', () => {
    expect(describePeriodMoneyUnavailable('no-trades')).toBe('No trade with a result yet');
    expect(describePeriodMoneyUnavailable('mixed-currencies')).toBe('Not available: your trades are in different currencies. Choose a home currency to add them up.');
    expect(describePeriodMoneyUnavailable('mixed-currencies', { homeCurrency: null, tradesMissingRate: 0 })).toBe('Not available: your trades are in different currencies. Choose a home currency to add them up.');
    expect(describePeriodMoneyUnavailable('mixed-currencies', EUR_ONE)).toBe('Not available: 1 trade still needs an exchange rate to count in EUR.');
    expect(describePeriodMoneyUnavailable('mixed-currencies', { homeCurrency: 'EUR', tradesMissingRate: 2 })).toBe('Not available: 2 trades still need an exchange rate to count in EUR.');
    expect(describePeriodMoneyUnavailable('mixed-currencies', { homeCurrency: 'EUR', tradesMissingRate: 0 })).toBe('Not available: a trade could not be converted to EUR.');
    expect(describePeriodMoneyUnavailable('missing-currency-evidence')).toBe('Not available: a trade has no currency.');
    expect(describePeriodMoneyUnavailable('unavailable-trade-outcome')).toBe('Not available: a trade has no result yet.');
    expect(describePeriodMoneyUnavailable('invalid-decimal')).toBe('Not available.');
    expect(describePeriodMoneyUnavailable('invalid-aggregate-decimal')).toBe('Not available.');
  });

  it('says why an average is not given', () => {
    expect(describeAverageUnavailable('win', 'no-trades')).toBe('No winning trade in this period');
    expect(describeAverageUnavailable('loss', 'no-trades')).toBe('No losing trade in this period');
    expect(describeAverageUnavailable('result', 'no-trades')).toBe('No trade with a result yet');
    expect(describeAverageUnavailable('win', 'mixed-currencies', EUR_ONE)).toBe('Not available: 1 trade still needs an exchange rate to count in EUR.');
  });
});
