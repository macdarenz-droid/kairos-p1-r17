import { createContext } from 'react';
import type { TradeExecutionRecord, TradeRecord } from '../../domain/trades';
import type { TradePictureCandlesResult } from '../../application/trade-visualizer';

/** `signal`: the picture that asked is gone; a load still waiting for its turn is then dropped. */
export type TradePictureCandleLoader = (trade: TradeRecord, executions: readonly TradeExecutionRecord[], options?: Readonly<{ signal?: AbortSignal }>) => Promise<TradePictureCandlesResult>;

export const TRADE_PICTURE_MAX_PARALLEL_LOADS = 3;
/** How many closed trades' candles are kept in memory (D15: never stored). */
export const TRADE_PICTURE_KEPT_CANDLES = 300;

/**
 * Runs at most `limit` loads at a time; the rest wait in order. A failed load frees its slot. A load whose `signal` was
 * aborted before its turn never starts (it rejects with an AbortError), so pictures that left the screen (a list left
 * for a trade's page) never hold up the ones that are on it.
 */
export function createLimitedQueue(limit: number): <T>(task: () => Promise<T>, signal?: AbortSignal) => Promise<T> {
  let running = 0;
  const waiting: Array<() => void> = [];
  const next = () => {
    if (running >= limit) return;
    const start = waiting.shift();
    if (start) start();
  };
  return (task, signal) => new Promise((resolve, reject) => {
    waiting.push(() => {
      if (signal?.aborted) { reject(new DOMException('The picture left the screen.', 'AbortError')); next(); return; }
      running += 1;
      task().then(resolve, reject).finally(() => { running -= 1; next(); });
    });
    next();
  });
}

/**
 * U15 (T-060c review r1): the trade pictures' candle loader. Loads go through one queue; a closed trade's candles, once
 * read, are kept in memory for as long as the trade is unchanged (its `updatedAt`), so coming back to the Journal's rows
 * reads none again. A planned or open trade reads afresh (its candles run to now), and a failed read is never kept, so
 * "Try again" asks again.
 */
export function createTradePictureCandleLoader(
  load: (trade: TradeRecord, executions: readonly TradeExecutionRecord[]) => Promise<TradePictureCandlesResult>,
  options: Readonly<{ parallel?: number; kept?: number }> = {},
): TradePictureCandleLoader {
  const queue = createLimitedQueue(options.parallel ?? TRADE_PICTURE_MAX_PARALLEL_LOADS);
  const keptLimit = options.kept ?? TRADE_PICTURE_KEPT_CANDLES;
  const kept = new Map<string, TradePictureCandlesResult>();
  return async (trade, executions, { signal } = {}) => {
    const key = trade.status === 'closed' ? `${trade.id}\n${trade.updatedAt}` : null;
    const known = key === null ? undefined : kept.get(key);
    if (known !== undefined) return known;
    const result = await queue(() => load(trade, executions), signal);
    if (key !== null && result.ok) {
      kept.set(key, result);
      if (kept.size > keptLimit) kept.delete(kept.keys().next().value!);
    }
    return result;
  };
}

/** Where trade pictures get their candles. The app shell provides the real loader; without one, pictures show no candles. */
export const TradePictureCandleLoaderContext = createContext<TradePictureCandleLoader | null>(null);
