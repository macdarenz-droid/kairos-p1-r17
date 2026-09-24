import { createContext } from 'react';
import type { TradeExecutionRecord, TradeRecord } from '../../domain/trades';
import type { MarketCandle } from '../../services/market-data/MarketCandleHistoryPort';

export type TradePictureCandleLoader = (trade: TradeRecord, executions: readonly TradeExecutionRecord[]) => Promise<readonly MarketCandle[] | null>;

export const TRADE_PICTURE_MAX_PARALLEL_LOADS = 3;

/** Runs at most `limit` loads at a time; the rest wait in order. A failed load frees its slot. */
export function createLimitedQueue(limit: number): <T>(task: () => Promise<T>) => Promise<T> {
  let running = 0;
  const waiting: Array<() => void> = [];
  const next = () => {
    if (running >= limit) return;
    const start = waiting.shift();
    if (start) start();
  };
  return task => new Promise((resolve, reject) => {
    waiting.push(() => {
      running += 1;
      task().then(resolve, reject).finally(() => { running -= 1; next(); });
    });
    next();
  });
}

/** Where trade pictures get their candles. The app shell provides the real loader; without one, pictures show no candles. */
export const TradePictureCandleLoaderContext = createContext<TradePictureCandleLoader | null>(null);
