import type { ProjectedIncrementalCandleRendererLifecycle } from '../features/chart';
import type { MarketCandle } from '../services/market-data/MarketCandleHistoryPort';
import type { MarketDataInstrument, MarketPriceObservation } from '../services/market-data/marketDataTypes';
import {
  projectBinanceSpotTradeCandleUpdate,
  type BinanceSpotTradeCandleUpdateProjectionResult,
} from '../services/market-data/providers/binance/binanceSpotTradeCandleUpdateProjection';

type ProjectionFailureReason = Extract<
  BinanceSpotTradeCandleUpdateProjectionResult,
  { readonly ok: false }
>['reason'];

export interface BinanceAnalysisCandleBackfillRequest {
  readonly instrument: MarketDataInstrument;
  readonly interval: string;
  readonly observation: MarketPriceObservation;
}

export type BinanceAnalysisLiveCandleDisposition =
  | { readonly kind: 'rendered-current' | 'rendered-next'; readonly candle: MarketCandle }
  | { readonly kind: 'ignored-stale' }
  | { readonly kind: 'backfill-required' }
  | { readonly kind: 'rejected'; readonly reason: Exclude<ProjectionFailureReason, 'gap-requires-backfill'> };

export interface BinanceAnalysisLiveCandleProjectionRendererSession {
  accept(observation: MarketPriceObservation): BinanceAnalysisLiveCandleDisposition;
  currentCandle(): MarketCandle;
}

/**
 * Item 4 application composition between the released P16.19 candle
 * projection and the released P17 incremental renderer.
 *
 * The caller owns the exact selected identity/timeframe, the initial
 * historical render, subscription/reconnect lifecycle and authoritative
 * history reacquisition. This session advances its latest candle only after
 * the renderer accepts the projected update; stale or rejected observations
 * never mutate chart state.
 */
export function createBinanceAnalysisLiveCandleProjectionRendererSession(options: {
  readonly instrument: MarketDataInstrument;
  readonly interval: string;
  readonly initialCandle: MarketCandle;
  readonly renderer: ProjectedIncrementalCandleRendererLifecycle;
  readonly onBackfillRequired: (request: BinanceAnalysisCandleBackfillRequest) => void;
}): BinanceAnalysisLiveCandleProjectionRendererSession {
  let current = options.initialCandle;

  return {
    accept(observation): BinanceAnalysisLiveCandleDisposition {
      const projected = projectBinanceSpotTradeCandleUpdate(
        options.instrument,
        options.interval,
        current,
        observation,
      );

      if (!projected.ok) {
        if (projected.reason === 'gap-requires-backfill') {
          options.onBackfillRequired(Object.freeze({
            instrument: options.instrument,
            interval: options.interval,
            observation,
          }));
          return { kind: 'backfill-required' };
        }
        return { kind: 'rejected', reason: projected.reason };
      }

      if (projected.kind === 'ignored-stale') return { kind: 'ignored-stale' };

      options.renderer.updateLatestCandle(projected.candle);
      current = projected.candle;
      return {
        kind: projected.kind === 'updated-current' ? 'rendered-current' : 'rendered-next',
        candle: current,
      };
    },
    currentCandle(): MarketCandle {
      return current;
    },
  };
}
