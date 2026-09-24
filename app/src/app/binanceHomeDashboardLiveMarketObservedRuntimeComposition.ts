import type { BinanceSpot24hPublicRestBaselineObservedAtSource } from '../services/market-data';
import {
  createHomeDashboardLiveMarketSummaryFreshnessObservationObserver,
  type HomeDashboardLiveMarketSummaryFreshnessEvaluationTimeSource,
  type HomeDashboardLiveMarketSummaryFreshnessObservationSink,
} from '../application/dashboard/homeDashboardLiveMarketSummaryFreshnessObservationBridge';
import {
  startBinanceHomeDashboardLiveMarketRuntime,
  type BinanceHomeDashboardLiveMarketRuntimeBootstrapOptions,
  type BinanceHomeDashboardLiveMarketRuntimeBootstrapResult,
} from './binanceHomeDashboardLiveMarketRuntimeBootstrap';
import type { HomeDashboardLiveMarketSummaryBrowserLifecycleAdapterOptions } from './homeDashboardLiveMarketSummaryBrowserLifecycleAdapter';

export interface BinanceHomeDashboardLiveMarketObservedRuntimeCompositionOptions
  extends Omit<BinanceHomeDashboardLiveMarketRuntimeBootstrapOptions, 'lifecycle'> {
  readonly lifecycle?: Omit<HomeDashboardLiveMarketSummaryBrowserLifecycleAdapterOptions, 'observer'>;
  readonly observationSink?: HomeDashboardLiveMarketSummaryFreshnessObservationSink;
}

/**
 * App-level, non-presentation composition that gives this boundary sole
 * ownership of the Home lifecycle observer slot while preserving all
 * released acquisition, universe, browser lifecycle, and close semantics.
 */
export function startBinanceHomeDashboardLiveMarketObservedRuntime(
  readObservedAt: BinanceSpot24hPublicRestBaselineObservedAtSource,
  readEvaluationTimeMs: HomeDashboardLiveMarketSummaryFreshnessEvaluationTimeSource,
  options: BinanceHomeDashboardLiveMarketObservedRuntimeCompositionOptions,
): Promise<BinanceHomeDashboardLiveMarketRuntimeBootstrapResult> {
  const observer = createHomeDashboardLiveMarketSummaryFreshnessObservationObserver(
    readEvaluationTimeMs,
    options.observationSink,
  );
  const lifecycle: HomeDashboardLiveMarketSummaryBrowserLifecycleAdapterOptions = {
    ...options.lifecycle,
    observer,
  };
  return startBinanceHomeDashboardLiveMarketRuntime(readObservedAt, {
    universe: options.universe,
    lifecycle,
  });
}
