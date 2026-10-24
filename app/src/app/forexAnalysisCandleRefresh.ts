import type { ProjectedIncrementalCandleRendererLifecycle } from '../features/chart';
import type { MarketCandle, MarketCandleHistoryPort, MarketCandleHistoryResult } from '../services/market-data/MarketCandleHistoryPort';
import type { MarketDataConnectionState, MarketDataInstrument } from '../services/market-data/marketDataTypes';
import type { BinanceSpotBrowserPublicTradeReconnectSubscriptionResult } from '../services/market-data/providers/binance/binanceSpotBrowserPublicTradeReconnectSubscription';
import type {
  BinanceAnalysisCandleBackfillRequest,
  BinanceAnalysisLiveCandleDisposition,
} from './binanceAnalysisLiveCandleProjectionRendererCoordination';

/** D234: how often the Analysis chart reads a forex pair's newest candles again. */
export const FOREX_ANALYSIS_REFRESH_MS = 30_000;
/** Candles one read asks for from the latest drawn one; a full page may have missed some, so history is read again. */
export const FOREX_ANALYSIS_REFRESH_LIMIT = 10;

export interface ForexAnalysisCandleRefreshTimers {
  readonly setInterval: (callback: () => void, ms: number) => unknown;
  readonly clearInterval: (id: unknown) => void;
}

export interface ForexAnalysisCandleRefreshOptions {
  readonly instrument: MarketDataInstrument;
  readonly interval: string;
  /** The last candle of the history page just drawn. */
  readonly initialCandle: MarketCandle;
  readonly renderer: ProjectedIncrementalCandleRendererLifecycle;
  readonly history: MarketCandleHistoryPort;
  readonly onBackfillRequired: (request: BinanceAnalysisCandleBackfillRequest) => void;
  readonly onDisposition?: (disposition: BinanceAnalysisLiveCandleDisposition) => void;
  readonly onStateChange?: (state: MarketDataConnectionState) => void;
  readonly onError?: (error: unknown) => void;
  readonly timers?: ForexAnalysisCandleRefreshTimers;
  readonly now?: () => number;
}

const sameCandle = (a: MarketCandle, b: MarketCandle) =>
  a.openTime === b.openTime && a.closeTime === b.closeTime && a.open === b.open && a.high === b.high && a.low === b.low && a.close === b.close;

const browserTimers: ForexAnalysisCandleRefreshTimers = {
  setInterval: (callback, ms) => globalThis.setInterval(callback, ms),
  clearInterval: id => globalThis.clearInterval(id as ReturnType<typeof globalThis.setInterval>),
};

/**
 * U10 (D234): forex candles come through the Kairos server, which passes no price stream, so the Analysis chart reads
 * the pair's newest candles again every 30 seconds in place of Binance's live stream. It is the live session the
 * history-then-live owners start after drawing history: the browser availability owner above closes it while the page is
 * hidden or offline (it never reads in a hidden tab) and reads history again when the page is back. Only candles at or
 * after the latest drawn one are applied, in order; a weekend simply brings none. A failed read says "disconnected" and
 * the next one tries again.
 */
export function startForexAnalysisCandleRefresh(options: ForexAnalysisCandleRefreshOptions): BinanceSpotBrowserPublicTradeReconnectSubscriptionResult {
  const { instrument, interval, renderer, history } = options;
  const timers = options.timers ?? browserTimers;
  const now = options.now ?? Date.now;
  let latest = options.initialCandle;
  let reading: AbortController | null = null;
  let closed = false;

  const read = async () => {
    if (closed || reading !== null) return;
    const controller = new AbortController();
    reading = controller;
    let result: MarketCandleHistoryResult;
    try {
      result = await history.acquireHistory({ instrument, interval, limit: FOREX_ANALYSIS_REFRESH_LIMIT, startTimeMs: Date.parse(latest.openTime) }, { signal: controller.signal });
    } catch {
      result = { ok: false, reason: 'transport-failed' };
    }
    reading = null;
    if (closed) return;
    if (!result.ok) {
      options.onStateChange?.('disconnected');
      return;
    }
    try {
      for (const candle of result.snapshot.candles) {
        if (Date.parse(candle.openTime) < Date.parse(latest.openTime) || sameCandle(candle, latest)) continue;
        const next = candle.openTime !== latest.openTime;
        renderer.updateLatestCandle(candle);
        latest = candle;
        options.onDisposition?.({ kind: next ? 'rendered-next' : 'rendered-current', candle });
      }
    } catch (error) {
      options.onStateChange?.('error');
      options.onError?.(error);
      return;
    }
    options.onStateChange?.('live');
    if (result.snapshot.candles.length >= FOREX_ANALYSIS_REFRESH_LIMIT) {
      options.onDisposition?.({ kind: 'backfill-required' });
      options.onBackfillRequired(Object.freeze({
        instrument, interval,
        observation: Object.freeze({ instrument, price: latest.close, observedAt: new Date(now()).toISOString(), sourceTimestamp: null }),
      }));
    }
  };

  const id = timers.setInterval(() => { void read(); }, FOREX_ANALYSIS_REFRESH_MS);
  // The history page was just drawn: the chart is current until the next read.
  options.onStateChange?.('live');
  return {
    ok: true,
    subscription: Object.freeze({
      close() {
        if (closed) return;
        closed = true;
        timers.clearInterval(id);
        reading?.abort();
      },
    }),
  };
}
