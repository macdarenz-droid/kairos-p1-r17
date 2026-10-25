import type { BinanceSpot24hPublicRestBaselineObservedAtSource } from '../services/market-data';
import {
  createHomeDashboardLiveCryptoBubbleMetricObservationSink,
  type HomeDashboardLiveCryptoBubbleMetricObservationSink,
} from '../application/dashboard/homeDashboardLiveCryptoBubbleMetricObservationBridge';
import type { HomeDashboardLiveMarketSummaryFreshnessEvaluationTimeSource } from '../application/dashboard/homeDashboardLiveMarketSummaryFreshnessObservationBridge';
import {
  startBinanceHomeDashboardLiveMarketObservedRuntime,
  type BinanceHomeDashboardLiveMarketObservedRuntimeCompositionOptions,
} from './binanceHomeDashboardLiveMarketObservedRuntimeComposition';
import type { BinanceHomeDashboardLiveMarketRuntimeBootstrapResult } from './binanceHomeDashboardLiveMarketRuntimeBootstrap';
import { appMarketDataPorts } from './marketDataPorts';

export interface BinanceHomeDashboardLiveCryptoBubbleObservedRuntimeCompositionOptions
  extends Omit<BinanceHomeDashboardLiveMarketObservedRuntimeCompositionOptions, 'observationSink'> {
  readonly observationSink?: HomeDashboardLiveCryptoBubbleMetricObservationSink;
}

/**
 * App-level, non-presentation composition that owns adaptation of the released
 * Gate344 Bubble metric-observation sink into the released Gate341 Binance Home
 * observed runtime. Runtime lifecycle and result semantics remain Gate341-owned.
 */
export function startBinanceHomeDashboardLiveCryptoBubbleObservedRuntime(
  readObservedAt: BinanceSpot24hPublicRestBaselineObservedAtSource,
  readEvaluationTimeMs: HomeDashboardLiveMarketSummaryFreshnessEvaluationTimeSource,
  options: BinanceHomeDashboardLiveCryptoBubbleObservedRuntimeCompositionOptions,
): Promise<BinanceHomeDashboardLiveMarketRuntimeBootstrapResult> {
  const observationSink = createHomeDashboardLiveCryptoBubbleMetricObservationSink(
    options.observationSink,
  );

  return startBinanceHomeDashboardLiveMarketObservedRuntime(
    readObservedAt,
    readEvaluationTimeMs,
    {
      universe: options.universe,
      lifecycle: options.lifecycle,
      observationSink,
      ...serverPorts(options.ports),
    },
  );
}

/**
 * U2: with the Kairos server set up, Home reads through the build's ports. Without it, the runtime keeps today's direct
 * Binance chain with the caller's clock; its failures say the same as the direct ports would (offline or no answer).
 */
function serverPorts(ports: BinanceHomeDashboardLiveCryptoBubbleObservedRuntimeCompositionOptions['ports']) {
  if (ports !== undefined) return { ports };
  const app = appMarketDataPorts();
  return app.route === 'server' ? { ports: app } : {};
}
