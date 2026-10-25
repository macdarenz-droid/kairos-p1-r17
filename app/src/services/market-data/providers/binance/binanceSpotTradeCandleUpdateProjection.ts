import { decimalSubtract } from '../../../../domain/calculations/decimalKernel';
import type { DecimalString } from '../../../../domain/trades';
import type { MarketCandle } from '../../MarketCandleHistoryPort';
import type { MarketPriceObservation } from '../../marketDataTypes';
import { BINANCE_SPOT_CANDLE_INTERVALS } from './binanceSpotCandleHistoryRequest';
import { BINANCE_SPOT_VENUE } from './binanceSpotTradeStream';

const FIXED_INTERVAL_MS: Readonly<Record<string, number>> = Object.freeze({
  '1s': 1_000,
  '1m': 60_000,
  '3m': 180_000,
  '5m': 300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1h': 3_600_000,
  '2h': 7_200_000,
  '4h': 14_400_000,
  '6h': 21_600_000,
  '8h': 28_800_000,
  '12h': 43_200_000,
  '1d': 86_400_000,
  '3d': 259_200_000,
  '1w': 604_800_000,
});

export type BinanceSpotTradeCandleUpdateProjectionResult =
  | { readonly ok: true; readonly kind: 'updated-current' | 'appended-next'; readonly candle: MarketCandle }
  | { readonly ok: true; readonly kind: 'ignored-stale' }
  | { readonly ok: false; readonly reason: 'instrument-mismatch' | 'interval-unsupported' | 'source-time-missing' | 'current-candle-invalid' | 'gap-requires-backfill' };

function bucketAt(epochMs: number, interval: string): { readonly openMs: number; readonly closeMs: number } | null {
  if (!Number.isSafeInteger(epochMs) || epochMs < 0) return null;
  if (interval === '1M') {
    const date = new Date(epochMs);
    const openMs = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1);
    const closeMs = Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1) - 1;
    return { openMs, closeMs };
  }
  const duration = FIXED_INTERVAL_MS[interval];
  if (!duration) return null;
  // Binance UTC weekly klines open on Monday; Unix epoch zero is Thursday.
  const mondayOffsetMs = interval === '1w' ? 3 * 86_400_000 : 0;
  const openMs = Math.floor((epochMs + mondayOffsetMs) / duration) * duration - mondayOffsetMs;
  return { openMs, closeMs: openMs + duration - 1 };
}

function compare(left: DecimalString, right: DecimalString): number | null {
  const difference = decimalSubtract(left, right);
  if (!difference.ok) return null;
  if (difference.value === '0') return 0;
  return difference.value.startsWith('-') ? -1 : 1;
}

/**
 * P16.19 projects one already-validated Binance Spot trade observation into
 * the selected historical snapshot's latest candle.
 *
 * It updates only the matching UTC bucket or creates only the immediately
 * adjacent bucket. A larger gap fails closed so a caller must reacquire
 * authoritative history instead of fabricating bars. Subscription lifecycle,
 * reconnect/backfill, chart updates, persistence and journal truth stay with
 * their existing owners.
 */
export function projectBinanceSpotTradeCandleUpdate(
  instrument: { readonly venue: string; readonly symbol: string },
  interval: string,
  current: MarketCandle,
  observation: MarketPriceObservation,
): BinanceSpotTradeCandleUpdateProjectionResult {
  if (instrument.venue !== BINANCE_SPOT_VENUE || observation.instrument.venue !== instrument.venue || observation.instrument.symbol !== instrument.symbol) {
    return { ok: false, reason: 'instrument-mismatch' };
  }
  if (!(BINANCE_SPOT_CANDLE_INTERVALS as readonly string[]).includes(interval)) {
    return { ok: false, reason: 'interval-unsupported' };
  }
  if (observation.sourceTimestamp === null) return { ok: false, reason: 'source-time-missing' };

  const sourceMs = Date.parse(observation.sourceTimestamp);
  const currentOpenMs = Date.parse(current.openTime);
  const currentCloseMs = Date.parse(current.closeTime);
  const sourceBucket = bucketAt(sourceMs, interval);
  const currentBucket = bucketAt(currentOpenMs, interval);
  if (!sourceBucket || !currentBucket || currentBucket.openMs !== currentOpenMs || currentBucket.closeMs !== currentCloseMs) {
    return { ok: false, reason: 'current-candle-invalid' };
  }
  const highComparison = compare(observation.price, current.high);
  const lowComparison = compare(observation.price, current.low);
  if (highComparison === null || lowComparison === null) return { ok: false, reason: 'current-candle-invalid' };

  if (sourceBucket.openMs < currentBucket.openMs) return { ok: true, kind: 'ignored-stale' };
  if (sourceBucket.openMs === currentBucket.openMs) {
    return {
      ok: true,
      kind: 'updated-current',
      candle: Object.freeze({
        ...current,
        high: highComparison > 0 ? observation.price : current.high,
        low: lowComparison < 0 ? observation.price : current.low,
        close: observation.price,
      }),
    };
  }

  const expectedNext = bucketAt(currentBucket.closeMs + 1, interval);
  if (!expectedNext || sourceBucket.openMs !== expectedNext.openMs) return { ok: false, reason: 'gap-requires-backfill' };
  return {
    ok: true,
    kind: 'appended-next',
    candle: Object.freeze({
      openTime: new Date(sourceBucket.openMs).toISOString(),
      closeTime: new Date(sourceBucket.closeMs).toISOString(),
      open: observation.price,
      high: observation.price,
      low: observation.price,
      close: observation.price,
    }),
  };
}
