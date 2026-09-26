import type { ProjectedIncrementalCandleRendererLifecycle } from '../features/chart';
import type {
  MarketCandleHistoryPort,
  MarketCandleHistoryResult,
  MarketCandleHistorySnapshot,
} from '../services/market-data/MarketCandleHistoryPort';
import type { MarketDataInstrument } from '../services/market-data/marketDataTypes';
import {
  createBinanceAnalysisSelectedLiveCandleSessionController,
  type BinanceAnalysisSelectedLiveCandleSessionController,
  type BinanceAnalysisSelectedLiveCandleSessionOptions,
} from './binanceAnalysisSelectedLiveCandleSessionController';

type HistoryFailure = Extract<MarketCandleHistoryResult, { readonly ok: false }>;

export type BinanceAnalysisHistoryLiveCandleBootstrapResult =
  | { readonly ok: true; readonly snapshot: MarketCandleHistorySnapshot }
  | { readonly ok: false; readonly reason: 'superseded' | 'history-scope-mismatch' | 'history-empty' | 'renderer-failed' }
  | { readonly ok: false; readonly reason: 'history-failed'; readonly failure: HistoryFailure }
  | { readonly ok: false; readonly reason: 'session-failed'; readonly detail: string };

export type BinanceAnalysisHistoryLiveCandleBootstrapOptions = Omit<
  BinanceAnalysisSelectedLiveCandleSessionOptions,
  'instrument' | 'interval' | 'initialCandle' | 'renderer'
> & {
  readonly instrument: MarketDataInstrument;
  readonly interval: string;
  readonly historyLimit: number;
  /** Renders the authoritative snapshot and returns that exact chart lifecycle. */
  readonly renderHistory: (snapshot: MarketCandleHistorySnapshot) => ProjectedIncrementalCandleRendererLifecycle;
};

export interface BinanceAnalysisHistoryLiveCandleBootstrapCoordinator {
  replace(options: BinanceAnalysisHistoryLiveCandleBootstrapOptions): Promise<BinanceAnalysisHistoryLiveCandleBootstrapResult>;
  stop(): void;
  isPending(): boolean;
  isLive(): boolean;
}

/**
 * Coordinates one cancellable authoritative history page into the released
 * selected live-candle session owner. The caller supplies exact scope,
 * reconnect policy, rendering and visible state; this boundary owns only
 * acquisition ordering, stale-result suppression and the history-to-live
 * handoff using the final returned candle.
 */
export function createBinanceAnalysisHistoryLiveCandleBootstrapCoordinator(
  history: MarketCandleHistoryPort,
  sessions: BinanceAnalysisSelectedLiveCandleSessionController =
    createBinanceAnalysisSelectedLiveCandleSessionController(),
): BinanceAnalysisHistoryLiveCandleBootstrapCoordinator {
  let generation = 0;
  let pending: AbortController | null = null;

  const current = (ticket: number) => ticket === generation;

  return {
    async replace(options) {
      const { historyLimit, renderHistory, ...liveOptions } = options;
      const ticket = ++generation;
      pending?.abort();
      sessions.stop();
      const requestController = new AbortController();
      pending = requestController;
      const request = {
        instrument: options.instrument,
        interval: options.interval,
        limit: historyLimit,
      } as const;

      let result: MarketCandleHistoryResult;
      try {
        result = await history.acquireHistory(request, { signal: requestController.signal });
      } catch {
        result = { ok: false, reason: 'transport-failed' };
      }

      if (!current(ticket)) return { ok: false, reason: 'superseded' };
      pending = null;
      if (!result.ok) return { ok: false, reason: 'history-failed', failure: result };

      const received = result.snapshot.request;
      if (
        received.instrument.venue !== request.instrument.venue
        || received.instrument.symbol !== request.instrument.symbol
        || received.interval !== request.interval
        || received.limit !== request.limit
        || received.startTimeMs !== undefined
        || received.endTimeMs !== undefined
      ) return { ok: false, reason: 'history-scope-mismatch' };
      if (result.snapshot.candles.length === 0) return { ok: false, reason: 'history-empty' };

      let renderer: ProjectedIncrementalCandleRendererLifecycle;
      try {
        renderer = renderHistory(result.snapshot);
      } catch {
        return { ok: false, reason: 'renderer-failed' };
      }
      if (!current(ticket)) return { ok: false, reason: 'superseded' };

      const live = sessions.replace({
        ...liveOptions,
        initialCandle: result.snapshot.candles[result.snapshot.candles.length - 1],
        renderer,
      });
      if (!live.ok) return { ok: false, reason: 'session-failed', detail: live.reason };
      if (!current(ticket)) return { ok: false, reason: 'superseded' };
      return { ok: true, snapshot: result.snapshot };
    },
    stop() {
      generation += 1;
      pending?.abort();
      pending = null;
      sessions.stop();
    },
    isPending() {
      return pending !== null;
    },
    isLive() {
      return sessions.isActive();
    },
  };
}
