/**
 * U5 (P13.A4, D202): how long each bar of the period pictures is, in steps out of PERIOD_PICTURE_STEPS. The won/lost bar
 * shares its steps by trade count; the money pictures scale through the decimal kernel. Steps are for drawing only,
 * never money; every amount stays with its owner (`summarizePerformance`).
 */

import { decimalAbs, decimalCompare, decimalScaleToSteps } from '../../domain/calculations/decimalKernel';
import type { DecimalString } from '../../domain/trades';
import type { PerformanceSummary } from './performanceSummary';

export const PERIOD_PICTURE_STEPS = 100;

export interface OutcomeBarPicture {
  readonly won: number;
  readonly lost: number;
  readonly breakEven: number;
  readonly noResult: number;
  readonly steps: Readonly<{ won: number; lost: number; breakEven: number; noResult: number }>;
}
export type WinLossPicture = Readonly<{ available: true; winSteps: number; lossSteps: number }> | Readonly<{ available: false }>;
export type TimesRiskedPicture = Readonly<{ available: true; direction: 'up' | 'down' | 'flat'; valueSteps: number; oneRiskSteps: number }> | Readonly<{ available: false }>;
export interface PeriodPictures {
  readonly outcomeBar: OutcomeBarPicture | null;
  readonly winLoss: WinLossPicture;
  readonly timesRisked: TimesRiskedPicture;
}

const NOT_AVAILABLE = Object.freeze({ available: false as const });

/** Shares the steps by count, largest remainder first (ties in the order given), then gives every count above 0 at least 1 step. Counts only. */
function shareSteps(counts: readonly number[]): number[] {
  const total = counts.reduce((sum, count) => sum + count, 0);
  const steps = counts.map((count) => Math.floor((count * PERIOD_PICTURE_STEPS) / total));
  const order = counts.map((count, index) => ({ index, remainder: (count * PERIOD_PICTURE_STEPS) % total }))
    .sort((left, right) => right.remainder - left.remainder || left.index - right.index);
  let left = PERIOD_PICTURE_STEPS - steps.reduce((sum, value) => sum + value, 0);
  for (const { index } of order) {
    if (left === 0) break;
    steps[index] += 1;
    left -= 1;
  }
  for (let index = 0; index < counts.length; index += 1) {
    if (counts[index] === 0 || steps[index] > 0) continue;
    const largest = steps.indexOf(Math.max(...steps));
    steps[largest] -= 1;
    steps[index] = 1;
  }
  return steps;
}

function projectOutcomeBar(summary: PerformanceSummary): OutcomeBarPicture | null {
  const { won, lost, breakEven, noResult } = summary.outcomes;
  if (summary.tradeCount === 0 || won + lost + breakEven + noResult === 0) return null;
  const [wonSteps, lostSteps, breakEvenSteps, noResultSteps] = shareSteps([won, lost, breakEven, noResult]);
  return Object.freeze({ won, lost, breakEven, noResult, steps: Object.freeze({ won: wonSteps, lost: lostSteps, breakEven: breakEvenSteps, noResult: noResultSteps }) });
}

const absolute = (value: DecimalString): DecimalString | null => {
  const result = decimalAbs(value);
  return result.ok ? result.value : null;
};
const larger = (left: DecimalString, right: DecimalString): DecimalString | null => {
  const order = decimalCompare(left, right);
  return order === null ? null : order >= 0 ? left : right;
};

function projectWinLoss(summary: PerformanceSummary): WinLossPicture {
  const { averageWin, averageLoss } = summary;
  if (!averageWin.available || !averageLoss.available) return NOT_AVAILABLE;
  const win = absolute(averageWin.amount);
  const loss = absolute(averageLoss.amount);
  const scale = win !== null && loss !== null ? larger(win, loss) : null;
  if (win === null || loss === null || scale === null) return NOT_AVAILABLE;
  const winSteps = decimalScaleToSteps(win, scale, PERIOD_PICTURE_STEPS);
  const lossSteps = decimalScaleToSteps(loss, scale, PERIOD_PICTURE_STEPS);
  if (winSteps === null || lossSteps === null) return NOT_AVAILABLE;
  return Object.freeze({ available: true as const, winSteps: Math.max(1, winSteps), lossSteps: Math.max(1, lossSteps) });
}

function projectTimesRisked(summary: PerformanceSummary): TimesRiskedPicture {
  const ratio = summary.averageTimesRisked;
  if (!ratio.available) return NOT_AVAILABLE;
  const sign = decimalCompare(ratio.value, '0');
  const size = absolute(ratio.value);
  const scale = size === null ? null : larger(size, '1' as DecimalString);
  if (sign === null || size === null || scale === null) return NOT_AVAILABLE;
  const valueSteps = decimalScaleToSteps(size, scale, PERIOD_PICTURE_STEPS);
  const oneRiskSteps = decimalScaleToSteps('1', scale, PERIOD_PICTURE_STEPS);
  if (valueSteps === null || oneRiskSteps === null) return NOT_AVAILABLE;
  return Object.freeze({
    available: true as const,
    direction: sign > 0 ? 'up' as const : sign < 0 ? 'down' as const : 'flat' as const,
    valueSteps: sign === 0 ? 0 : Math.max(1, valueSteps),
    oneRiskSteps,
  });
}

/** The bar lengths of the period pictures, from the period numbers as given. */
export function projectPeriodPictures(summary: PerformanceSummary): PeriodPictures {
  return Object.freeze({
    outcomeBar: projectOutcomeBar(summary),
    winLoss: projectWinLoss(summary),
    timesRisked: projectTimesRisked(summary),
  });
}
