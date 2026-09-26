import {
  acquireBinanceSpotBrowserLiveMarketUniverseOnce,
  createBinanceHomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionPort,
  createLiveMarketSummaryStateSession,
  type BinanceSpot24hPublicRestBaselineObservedAtSource,
  type LiveMarketUniverseAcquisitionOptions,
  type MarketDataInstrument,
} from '../services/market-data';
import {
  createHomeDashboardLiveMarketSummaryBrowserLifecycleAdapter,
  type HomeDashboardLiveMarketSummaryBrowserLifecycleAdapterOptions,
} from './homeDashboardLiveMarketSummaryBrowserLifecycleAdapter';

export interface BinanceHomeDashboardLiveMarketRuntime {
  readonly instruments: readonly MarketDataInstrument[];
  readonly close: () => void;
}

export type BinanceHomeDashboardLiveMarketRuntimeBootstrapResult =
  | { readonly ok: true; readonly runtime: BinanceHomeDashboardLiveMarketRuntime }
  | { readonly ok: false; readonly reason: 'acquisition-failed' };

export interface BinanceHomeDashboardLiveMarketRuntimeBootstrapOptions {
  readonly universe: LiveMarketUniverseAcquisitionOptions;
  readonly lifecycle?: HomeDashboardLiveMarketSummaryBrowserLifecycleAdapterOptions;
}

/**
 * Non-presentation Home live-market runtime bootstrap for the released Binance
 * Spot browser chain. Universe acquisition stays one-shot; summary cadence and
 * browser lifecycle remain owned by the released lifecycle adapter.
 */
export async function startBinanceHomeDashboardLiveMarketRuntime(
  readObservedAt: BinanceSpot24hPublicRestBaselineObservedAtSource,
  options: BinanceHomeDashboardLiveMarketRuntimeBootstrapOptions,
): Promise<BinanceHomeDashboardLiveMarketRuntimeBootstrapResult> {
  const universeResult = await acquireBinanceSpotBrowserLiveMarketUniverseOnce(
    readObservedAt,
    options.universe,
  );
  if (!universeResult.ok) return universeResult;

  const instruments = universeResult.instruments;
  if (instruments.length === 0) {
    return {
      ok: true,
      runtime: {
        instruments,
        close() {},
      },
    };
  }

  const session = createLiveMarketSummaryStateSession();
  const port = createBinanceHomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionPort(
    session,
    readObservedAt,
  );
  const lifecycle = createHomeDashboardLiveMarketSummaryBrowserLifecycleAdapter(
    port,
    instruments,
    options.lifecycle,
  );

  return {
    ok: true,
    runtime: {
      instruments,
      close: lifecycle.close,
    },
  };
}
