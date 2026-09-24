import { decimalCompare, decimalScaleToSteps, decimalSubtract } from '../../domain/calculations';
import type { DecimalString } from '../../domain/trades';
import type { VisualPnlCumulativeRealizedPnlProjection } from './cumulativeRealizedPnl';

export const VISUAL_PNL_RESULT_LINE_STEPS = 1000;
export interface VisualPnlResultLinePoint { readonly dayKey: string; readonly cumulativeAmount: DecimalString; readonly xStep: number; readonly yStep: number; }
export type VisualPnlResultLineProjection =
  | Readonly<{ available: true; currency: string; zeroYStep: number; points: readonly VisualPnlResultLinePoint[]; latest: VisualPnlResultLinePoint; latestOutcome: 'profit' | 'loss' | 'breakeven' }>
  | Readonly<{ available: false; reason: Extract<VisualPnlCumulativeRealizedPnlProjection, { available: false }>['reason'] | 'invalid-scale-decimal' }>;

const ZERO = '0' as DecimalString;
const invalidScale: VisualPnlResultLineProjection = Object.freeze({ available: false as const, reason: 'invalid-scale-decimal' as const });

function classify(amount: DecimalString): 'profit' | 'loss' | 'breakeven' {
  if (amount === '0') return 'breakeven';
  return amount.startsWith('-') ? 'loss' : 'profit';
}

/**
 * Drawing positions for the total result so far, from the existing
 * cumulative owner's output. It adds no new sums: positions are step counts
 * (0–1000) from the decimal kernel, never money. 0 is always on the scale
 * because the line starts from 0.
 */
export function projectVisualPnlResultLine(cumulative: VisualPnlCumulativeRealizedPnlProjection): VisualPnlResultLineProjection {
  if (!cumulative.available) return Object.freeze({ available: false as const, reason: cumulative.reason });
  const amounts = cumulative.points.map(point => point.cumulativeAmount);
  if (amounts.length === 0) return Object.freeze({ available: false as const, reason: 'no-result-days' as const });

  let low = ZERO, high = ZERO;
  for (const amount of amounts) {
    const belowLow = decimalCompare(amount, low), aboveHigh = decimalCompare(amount, high);
    if (belowLow === null || aboveHigh === null) return invalidScale;
    if (belowLow < 0) low = amount;
    if (aboveHigh > 0) high = amount;
  }
  const range = decimalSubtract(high, low);
  if (!range.ok) return invalidScale;
  const flat = range.value === '0';
  const toStep = (amount: DecimalString): number | null => {
    if (flat) return VISUAL_PNL_RESULT_LINE_STEPS / 2;
    const offset = decimalSubtract(amount, low);
    return offset.ok ? decimalScaleToSteps(offset.value, range.value, VISUAL_PNL_RESULT_LINE_STEPS) : null;
  };

  const zeroYStep = toStep(ZERO);
  if (zeroYStep === null) return invalidScale;
  const count = cumulative.points.length;
  const points: VisualPnlResultLinePoint[] = [];
  for (const [index, point] of cumulative.points.entries()) {
    const yStep = toStep(point.cumulativeAmount);
    if (yStep === null) return invalidScale;
    // Each day with results takes one equal step: a count, not money.
    points.push(Object.freeze({ dayKey: point.dayKey, cumulativeAmount: point.cumulativeAmount, xStep: Math.round(((index + 1) * VISUAL_PNL_RESULT_LINE_STEPS) / count), yStep }));
  }
  const latest = points[points.length - 1];
  return Object.freeze({ available: true as const, currency: cumulative.currency, zeroYStep, points: Object.freeze(points), latest, latestOutcome: classify(latest.cumulativeAmount) });
}
