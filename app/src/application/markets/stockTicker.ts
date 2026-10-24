/**
 * P32: the one owner of what a stock ticker is and of what a stock trade won or lost per share. A ticker is checked only for its shape, as the trader's broker writes it; Kairos never reads a currency or an exchange from it (golden rule 4). Every number goes through the decimal kernel; nothing is converted (P33).
 */

import { decimalDivide, type TradeMetrics } from '../../domain/calculations';
import type { DecimalString } from '../../domain/trades';

/** A ticker has at most this many characters. */
export const STOCK_TICKER_MAX_LENGTH = 20;
/** Letters and digits, joined by single dots, hyphens or & (BRK.B, 7203.T, BAJAJ-AUTO.NS, M&M.NS). */
const TICKER_PATTERN = /^[A-Z0-9]+(?:[.&-][A-Z0-9]+)*$/;

export type StockTickerProblem = 'ticker-required' | 'not-a-ticker';
export type StockTickerResult =
  | Readonly<{ ok: true; ticker: string }>
  | Readonly<{ ok: false; reason: StockTickerProblem }>;

const refuse = (reason: StockTickerProblem): StockTickerResult => Object.freeze({ ok: false as const, reason });

/** The ticker as the save command stores it (trimmed, upper case), or why it is not one. */
export function parseStockTicker(symbol: string): StockTickerResult {
  const ticker = symbol.trim().toUpperCase();
  if (ticker === '') return refuse('ticker-required');
  if (ticker.length > STOCK_TICKER_MAX_LENGTH || !TICKER_PATTERN.test(ticker)) return refuse('not-a-ticker');
  return Object.freeze({ ok: true as const, ticker });
}

/**
 * What a fully closed trade won or lost per share, before fees: the result before fees ÷ the shares, exact.
 * Null unless every entry is exited (state 'realized') and the result before fees is known.
 */
export function projectStockResultPerShare(metrics: TradeMetrics): DecimalString | null {
  if (metrics.state !== 'realized' || metrics.grossPnl === null) return null;
  const perShare = decimalDivide(metrics.grossPnl, metrics.totalEnteredQuantity);
  return perShare.ok ? perShare.value : null;
}
