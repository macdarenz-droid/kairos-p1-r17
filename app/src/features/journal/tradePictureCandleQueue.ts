import { createContext } from 'react';
import { createTradePictureCandleBrowserDeps, loadTradePictureCandles } from '../../application/trade-visualizer';
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

let browserLoader: TradePictureCandleLoader | null = null;

/** Real candles through Binance Spot, at most three loads at once for the whole page. */
export function browserTradePictureCandleLoader(): TradePictureCandleLoader {
  if (browserLoader) return browserLoader;
  const queue = createLimitedQueue(TRADE_PICTURE_MAX_PARALLEL_LOADS);
  const deps = createTradePictureCandleBrowserDeps();
  browserLoader = (trade, executions) => queue(() => loadTradePictureCandles(trade, executions, deps));
  return browserLoader;
}

/** Where trade pictures get their candles; tests and previews supply their own. Null means the browser loader. */
export const TradePictureCandleLoaderContext = createContext<TradePictureCandleLoader | null>(null);
