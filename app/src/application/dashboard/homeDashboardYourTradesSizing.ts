/**
 * U16 (P21.A1, D270): the one owner of how big each "Your Trades" bubble is and which bubbles show. A bigger result
 * after fees, won or lost, is a bigger bubble: 0.3 + 0.7 × √(steps ÷ 1000), where steps place |result| on 0–1000
 * against the biggest |result| of its group (the decimal kernel's `decimalScaleToSteps`; no `Number()` on money).
 * A group is the home currency, or, with none chosen, each recorded currency. A trade that can't be compared, or has no
 * result, is the smallest. At most the 40 biggest show (equal sizes: the newest close first). The radii are
 * dimensionless weights for the bubble packer; they never become money.
 */

import { decimalAbs, decimalCompare, decimalScaleToSteps } from '../../domain/calculations/decimalKernel';
import type { DecimalString } from '../../domain/trades';
import type { HomeYourTrade } from './homeDashboardYourTradesQuery';

export const YOUR_TRADES_SHOWN_LIMIT = 40;
const STEPS = 1000;
const SMALLEST = .3;
const GROWTH = .7;

/** compared: sized on its group's scale; not-compared: a result off the scale (drawn with a dashed edge); no-result: nothing to size. */
export type YourTradeSizeBasis = 'compared' | 'not-compared' | 'no-result';
export interface YourTradeBubbleSize { readonly key: string; readonly radius: number; readonly basis: YourTradeSizeBasis }
export interface YourTradeBubbleSizes {
  /** The bubbles that show, in the read's order (newest close first). */
  readonly bubbles: readonly YourTradeBubbleSize[];
  /** How many trades the period holds; more than `bubbles.length` when only the biggest show. */
  readonly total: number;
  /** How many currencies the sizes compare in: 1 with a home currency; more when results in different currencies are each compared in their own. */
  readonly currencies: number;
  /** The period's trades with a result that could not be compared, by why. */
  readonly notCompared: Readonly<{ missingRate: number; unknownCurrency: number }>;
}

interface Sized { readonly trade: HomeYourTrade; readonly index: number; readonly steps: number; readonly basis: YourTradeSizeBasis }

/** |compared result|, or null when the trade is not on a scale. */
function magnitude(trade: HomeYourTrade): DecimalString | null {
  if (trade.compared.kind !== 'compared') return null;
  const size = decimalAbs(trade.compared.amount);
  return size.ok ? size.value : null;
}

const closeTime = (trade: HomeYourTrade): number => {
  const time = trade.closedAt === null ? Number.NaN : Date.parse(trade.closedAt);
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
};

export function projectYourTradeBubbleSizes(trades: readonly HomeYourTrade[], limit: number = YOUR_TRADES_SHOWN_LIMIT): YourTradeBubbleSizes {
  const sizes = trades.map(magnitude);
  const biggest = new Map<string, DecimalString>();
  trades.forEach((trade, index) => {
    const size = sizes[index];
    if (size === null || trade.compared.kind !== 'compared') return;
    const current = biggest.get(trade.compared.currency);
    if (current === undefined || decimalCompare(size, current) === 1) biggest.set(trade.compared.currency, size);
  });

  let missingRate = 0;
  let unknownCurrency = 0;
  const sized: Sized[] = trades.map((trade, index) => {
    const { compared } = trade;
    if (compared.kind === 'not-compared') {
      if (compared.reason === 'missing-rate') missingRate += 1;
      else unknownCurrency += 1;
      return { trade, index, steps: 0, basis: 'not-compared' };
    }
    const size = sizes[index];
    const scale = compared.kind === 'compared' ? biggest.get(compared.currency) : undefined;
    if (size === null || scale === undefined) return { trade, index, steps: 0, basis: 'no-result' };
    // A group whose biggest result is 0 (all break-even) has no scale: its bubbles are the smallest.
    return { trade, index, steps: decimalScaleToSteps(size, scale, STEPS) ?? 0, basis: 'compared' };
  });

  const shown = new Set([...sized]
    .sort((left, right) => right.steps - left.steps || closeTime(right.trade) - closeTime(left.trade) || left.index - right.index)
    .slice(0, Math.max(0, limit))
    .map(item => item.index));
  const bubbles = sized
    .filter(item => shown.has(item.index))
    .map(({ trade, steps, basis }): YourTradeBubbleSize => Object.freeze({ key: trade.id, radius: SMALLEST + GROWTH * Math.sqrt(steps / STEPS), basis }));
  return Object.freeze({
    bubbles: Object.freeze(bubbles),
    total: trades.length,
    currencies: biggest.size,
    notCompared: Object.freeze({ missingRate, unknownCurrency }),
  });
}
