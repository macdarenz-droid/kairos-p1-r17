import type { BinanceSpot24hPublicRestBaselineObservedAtSource } from '../services/market-data';
import {
  createHomeDashboardLiveCryptoBubblePresentationStateObservationSink,
  type HomeDashboardLiveCryptoBubblePresentationStateObservationSink,
} from '../application/dashboard/homeDashboardLiveCryptoBubblePresentationStateObservationBridge';
import type { HomeDashboardLiveCryptoBubblePresentationPolicy } from '../application/dashboard/homeDashboardLiveCryptoBubblePresentationStateProjection';
import type { HomeDashboardLiveMarketSummaryFreshnessEvaluationTimeSource } from '../application/dashboard/homeDashboardLiveMarketSummaryFreshnessObservationBridge';
import {
  startBinanceHomeDashboardLiveCryptoBubbleObservedRuntime,
  type BinanceHomeDashboardLiveCryptoBubbleObservedRuntimeCompositionOptions,
} from './binanceHomeDashboardLiveCryptoBubbleObservedRuntimeComposition';
import type { BinanceHomeDashboardLiveMarketRuntimeBootstrapResult } from './binanceHomeDashboardLiveMarketRuntimeBootstrap';

export interface BinanceHomeDashboardLiveCryptoBubblePresentationObservedRuntimeCompositionOptions
  extends Omit<BinanceHomeDashboardLiveCryptoBubbleObservedRuntimeCompositionOptions, 'observationSink'> {
  readonly presentationPolicy: HomeDashboardLiveCryptoBubblePresentationPolicy;
  readonly observationSink?: HomeDashboardLiveCryptoBubblePresentationStateObservationSink;
}

/**
 * App-level composition that adapts the released Gate349 semantic presentation
 * observation sink into the released Gate345 Binance Bubble observed runtime.
 * Runtime/acquisition and semantic projection ownership remain delegated.
 */
export function startBinanceHomeDashboardLiveCryptoBubblePresentationObservedRuntime(
  readObservedAt: BinanceSpot24hPublicRestBaselineObservedAtSource,
  readEvaluationTimeMs: HomeDashboardLiveMarketSummaryFreshnessEvaluationTimeSource,
  options: BinanceHomeDashboardLiveCryptoBubblePresentationObservedRuntimeCompositionOptions,
): Promise<BinanceHomeDashboardLiveMarketRuntimeBootstrapResult> {
  const observationSink = createHomeDashboardLiveCryptoBubblePresentationStateObservationSink(
    options.presentationPolicy,
    options.observationSink,
  );

  return startBinanceHomeDashboardLiveCryptoBubbleObservedRuntime(
    readObservedAt,
    readEvaluationTimeMs,
    {
      universe: options.universe,
      lifecycle: options.lifecycle,
      observationSink,
    },
  );
}
