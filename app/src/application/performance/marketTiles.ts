/**
 * U5 (P13.A4, D206): "Your markets" — one tile per market as saved (market type and symbol; nothing guessed or merged),
 * sized by money made or lost when every total is in one currency, else by trades. Totals come from the aggregation
 * owner, counts from summarizeTradeOutcomes; sizes are steps through the decimal kernel, or counts.
 */

import { decimalAbs, decimalCompare, decimalScaleToSteps } from '../../domain/calculations/decimalKernel';
import type { DecimalString, MarketType, TradeId } from '../../domain/trades';
import type { JournalHistoryEntry } from '../journal/historyQuery';
import { summarizeVisualPnlAggregation, type VisualPnlAggregationSummary } from '../visual-pnl/aggregationSummary';
import { summarizeTradeOutcomes, type TradeOutcomeSummary } from './performanceSummary';

export const MARKET_TILES_SHOWN = 12;

export interface MarketTile {
  /** `${marketType}:${symbol}`, or 'other'. */
  readonly key: string;
  /** null for 'other'. */
  readonly symbol: string | null;
  readonly marketType: MarketType | null;
  /** 1, or how many markets 'other' holds. */
  readonly marketCount: number;
  readonly tradeIds: readonly TradeId[];
  readonly outcomes: TradeOutcomeSummary;
  readonly total: VisualPnlAggregationSummary;
  readonly size: 1 | 2 | 3;
}
export interface MarketTiles {
  readonly tiles: readonly MarketTile[];
  readonly sizeBasis: 'money' | 'trades';
  /** The one currency of every tile's total; null when a total is unavailable or two currencies differ. Set whenever sizeBasis is 'money'. */
  readonly currency: string | null;
}

type Group = Readonly<{ key: string; symbol: string | null; marketType: MarketType | null; marketCount: number; entries: readonly JournalHistoryEntry[]; total: VisualPnlAggregationSummary }>;

const sizeOf = (total: VisualPnlAggregationSummary): DecimalString | null => {
  if (!total.available) return null;
  const size = decimalAbs(total.total);
  return size.ok ? size.value : null;
};
const group = (key: string, symbol: string | null, marketType: MarketType | null, marketCount: number, entries: readonly JournalHistoryEntry[]): Group =>
  ({ key, symbol, marketType, marketCount, entries, total: summarizeVisualPnlAggregation(entries.map(entry => entry.visualPnl)) });

/** The one currency of every total, or null. */
function oneCurrency(groups: readonly Group[]): string | null {
  const first = groups[0]?.total;
  if (first === undefined || !first.available) return null;
  return groups.every(item => item.total.available && item.total.currency === first.currency) ? first.currency : null;
}

/** Entries are the period's closed trades in close order (the dashboard's), after the home-currency step when there is one. */
export function projectMarketTiles(entries: readonly JournalHistoryEntry[]): MarketTiles {
  const byMarket = new Map<string, JournalHistoryEntry[]>();
  for (const entry of entries) {
    const key = `${entry.trade.marketType}:${entry.trade.symbol}`;
    const list = byMarket.get(key);
    if (list === undefined) byMarket.set(key, [entry]); else list.push(entry);
  }
  const position = new Map(entries.map((entry, index) => [entry, index]));
  const groups = [...byMarket.entries()].map(([key, list]) => group(key, list[0]!.trade.symbol, list[0]!.trade.marketType, 1, list));
  const currency = oneCurrency(groups);
  const money = currency !== null && groups.some(item => item.total.available && decimalCompare(item.total.total, '0') !== 0);

  const ordered = [...groups].sort((left, right) => {
    if (money) {
      const order = decimalCompare(sizeOf(right.total)!, sizeOf(left.total)!);
      if (order !== null && order !== 0) return order;
    }
    return right.entries.length - left.entries.length
      || (left.symbol! < right.symbol! ? -1 : left.symbol! > right.symbol! ? 1 : 0)
      || (left.marketType! < right.marketType! ? -1 : left.marketType! > right.marketType! ? 1 : 0);
  });
  const shown = ordered.length <= MARKET_TILES_SHOWN ? ordered : [
    ...ordered.slice(0, MARKET_TILES_SHOWN - 1),
    group('other', null, null, ordered.length - (MARKET_TILES_SHOWN - 1), ordered.slice(MARKET_TILES_SHOWN - 1).flatMap(item => item.entries)
      .sort((left, right) => position.get(left)! - position.get(right)!)),
  ];

  // Sizes are steps of the largest total, or counts of the largest market: never money.
  let largest: DecimalString | null = null;
  if (money) for (const item of shown) {
    const size = sizeOf(item.total);
    if (size !== null && (largest === null || (decimalCompare(size, largest) ?? 0) > 0)) largest = size;
  }
  const mostTrades = Math.max(...shown.map(item => item.entries.length));
  const tiles = shown.map((item): MarketTile => {
    const steps = money && largest !== null ? decimalScaleToSteps(sizeOf(item.total) ?? '0', largest, 3) : Math.round((3 * item.entries.length) / mostTrades);
    return Object.freeze({
      key: item.key, symbol: item.symbol, marketType: item.marketType, marketCount: item.marketCount,
      tradeIds: Object.freeze(item.entries.map(entry => entry.trade.id)),
      outcomes: summarizeTradeOutcomes(item.entries),
      total: item.total,
      size: Math.max(1, steps ?? 1) as 1 | 2 | 3,
    });
  });
  return Object.freeze({ tiles: Object.freeze(tiles), sizeBasis: money ? 'money' as const : 'trades' as const, currency: oneCurrency(shown) });
}
