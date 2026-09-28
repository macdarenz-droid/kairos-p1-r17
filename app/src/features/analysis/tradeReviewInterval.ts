import type { JournalHistoryEntry } from '../../application/journal';

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

/** Candidate chart timeframes for a trade review, smallest first, with their candle length. */
export const TRADE_REVIEW_INTERVALS = Object.freeze([
  Object.freeze({ interval: '5m', ms: 5 * MINUTE_MS }),
  Object.freeze({ interval: '15m', ms: 15 * MINUTE_MS }),
  Object.freeze({ interval: '1h', ms: HOUR_MS }),
  Object.freeze({ interval: '4h', ms: 4 * HOUR_MS }),
  Object.freeze({ interval: '1d', ms: DAY_MS }),
  Object.freeze({ interval: '1w', ms: 7 * DAY_MS }),
] as const);

export type TradeReviewInterval = (typeof TRADE_REVIEW_INTERVALS)[number]['interval'];

/** The chart loads the latest 500 candles; keeping the trade start within 400 leaves room around it. */
export const TRADE_REVIEW_MAX_CANDLES_SINCE_START = 400;
export const TRADE_REVIEW_PADDING_FRACTION = 0.2;
export const TRADE_REVIEW_MIN_PADDING_CANDLES = 20;

export function pickTradeReviewInterval(startMs: number, nowMs: number): TradeReviewInterval {
  const elapsed = nowMs - startMs;
  const match = TRADE_REVIEW_INTERVALS.find(item => elapsed <= TRADE_REVIEW_MAX_CANDLES_SINCE_START * item.ms);
  return match ? match.interval : '1w';
}

export function tradeReviewIntervalMs(interval: string): number | null {
  return TRADE_REVIEW_INTERVALS.find(item => item.interval === interval)?.ms ?? null;
}

export interface TradeReviewTimeRange {
  readonly fromMs: number;
  readonly toMs: number;
}

/** The trade window plus 20% of its length on each side, and at least 20 candles on each side. */
export function tradeReviewVisibleRange(startMs: number, endMs: number, intervalMs: number): TradeReviewTimeRange {
  const padding = Math.max((endMs - startMs) * TRADE_REVIEW_PADDING_FRACTION, TRADE_REVIEW_MIN_PADDING_CANDLES * intervalMs);
  return Object.freeze({ fromMs: startMs - padding, toMs: endMs + padding });
}

function parseMs(value: string | null | undefined): number | null {
  if (value == null) return null;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

/** Start: earliest fill, else opened, else created. End: latest exit fill, else closed, else null (still running). */
export function tradeReviewTimes(entry: JournalHistoryEntry): { readonly startMs: number | null; readonly endMs: number | null } {
  const fills = entry.executions.map(execution => parseMs(execution.executedAt)).filter((ms): ms is number => ms !== null);
  const exits = entry.executions.filter(execution => execution.type === 'exit').map(execution => parseMs(execution.executedAt)).filter((ms): ms is number => ms !== null);
  const startMs = fills.length > 0 ? Math.min(...fills) : parseMs(entry.trade.openedAt) ?? parseMs(entry.trade.createdAt);
  const endMs = entry.trade.status === 'open' || entry.trade.status === 'draft'
    ? null
    : exits.length > 0 ? Math.max(...exits) : parseMs(entry.trade.closedAt);
  return { startMs, endMs };
}

/** One owner for trade → market symbol normalisation (the trade picture uses it too). */
export { normalizeTradeSymbol } from '../../application/trade-visualizer/tradePictureCandles';
