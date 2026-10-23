import { describe, expect, it } from 'vitest';
import { projectPeriodPictures } from '../src/application/performance/periodPictures';
import type { PerformanceMoney, PerformanceRatio, PerformanceSummary } from '../src/application/performance/performanceSummary';
import type { DecimalString } from '../src/domain/trades';

const money = (amount: string): PerformanceMoney => ({ available: true, amount: amount as DecimalString, shown: amount as DecimalString, currency: 'USDT', tradeCount: 2 });
const ratio = (value: string): PerformanceRatio => ({ available: true, value: value as DecimalString, shown: value as DecimalString, tradeCount: 2 });
const none = { available: false, reason: 'no-trades', tradeCount: 0 } as const;

function summary(won: number, lost: number, breakEven: number, noResult: number, parts: Partial<PerformanceSummary> = {}): PerformanceSummary {
  const resultCount = won + lost + breakEven;
  const tradeCount = resultCount + noResult;
  return {
    tradeCount,
    outcomes: { tradeCount, won, lost, breakEven, noResult, resultCount, enough: resultCount >= 10, wonPercent: null },
    averageWin: none, averageLoss: none, averageResult: none, profitFactor: none, bestTrade: none, worstTrade: none, averageTimesRisked: none,
    averageTime: { available: false, reason: 'no-trades', tradeCount: 0, tradesWithBadTimes: 0 },
    biggestDip: { available: false, reason: 'no-trades', tradeCount: 0 },
    longestWinStreak: { available: false, reason: 'no-trades', tradeCount: 0, tradesWithoutResult: 0 },
    longestLossStreak: { available: false, reason: 'no-trades', tradeCount: 0, tradesWithoutResult: 0 },
    ...parts,
  };
}

describe('T-051b the sizes of the number pictures', () => {
  it('shares the won/lost bar by count, by largest remainder, always 100 steps', () => {
    const bar = projectPeriodPictures(summary(2, 2, 1, 1)).outcomeBar;
    expect(bar).toEqual({ won: 2, lost: 2, breakEven: 1, noResult: 1, steps: { won: 33, lost: 33, breakEven: 17, noResult: 17 } });
    expect(projectPeriodPictures(summary(1, 99, 0, 0)).outcomeBar?.steps).toEqual({ won: 1, lost: 99, breakEven: 0, noResult: 0 });
    const tiny = projectPeriodPictures(summary(1, 999, 0, 0)).outcomeBar!.steps;
    expect(tiny).toEqual({ won: 1, lost: 99, breakEven: 0, noResult: 0 });
  });

  it('draws the average win against the average loss', () => {
    expect(projectPeriodPictures(summary(1, 1, 0, 0, { averageWin: money('15'), averageLoss: money('-10') })).winLoss).toEqual({ available: true, winSteps: 100, lossSteps: 67 });
    expect(projectPeriodPictures(summary(2, 0, 0, 0, { averageWin: money('15') })).winLoss).toEqual({ available: false });
  });

  it('draws what you make against one risk', () => {
    expect(projectPeriodPictures(summary(1, 1, 0, 0, { averageTimesRisked: ratio('0.4') })).timesRisked).toEqual({ available: true, direction: 'up', valueSteps: 40, oneRiskSteps: 100 });
    expect(projectPeriodPictures(summary(1, 1, 0, 0, { averageTimesRisked: ratio('-2') })).timesRisked).toEqual({ available: true, direction: 'down', valueSteps: 100, oneRiskSteps: 50 });
    expect(projectPeriodPictures(summary(1, 1, 0, 0, { averageTimesRisked: ratio('0') })).timesRisked).toEqual({ available: true, direction: 'flat', valueSteps: 0, oneRiskSteps: 100 });
    expect(projectPeriodPictures(summary(1, 1, 0, 0)).timesRisked).toEqual({ available: false });
  });

  it('has no bar without trades, and is frozen', () => {
    const pictures = projectPeriodPictures(summary(0, 0, 0, 0));
    expect(pictures.outcomeBar).toBeNull();
    expect(Object.isFrozen(pictures)).toBe(true);
    expect(Object.isFrozen(projectPeriodPictures(summary(1, 1, 0, 0)).outcomeBar)).toBe(true);
  });
});
