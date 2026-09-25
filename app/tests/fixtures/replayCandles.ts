import { parseDecimalString, type DecimalString } from '../../src/domain/trades';
import type { MarketCandle } from '../../src/services/market-data/MarketCandleHistoryPort';

export const HOUR = 3_600_000;

function dec(value: string): DecimalString {
  const parsed = parseDecimalString(value);
  if (!parsed.ok) throw new Error(`fixture decimal ${value}`);
  return parsed.value;
}

/** One finished candle of `ms` length starting at `openMs`, with exact decimal prices. */
export function replayCandle(openMs: number, open: string, high: string, low: string, close: string, ms = HOUR): MarketCandle {
  return Object.freeze({
    openTime: new Date(openMs).toISOString(),
    closeTime: new Date(openMs + ms - 1).toISOString(),
    open: dec(open), high: dec(high), low: dec(low), close: dec(close),
  });
}
