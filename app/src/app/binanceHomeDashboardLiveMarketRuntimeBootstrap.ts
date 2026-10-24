import {
  acquireLiveMarketSummaryBaselineIntoState,
  acquireLiveMarketUniverseOnce,
  createLiveMarketSummaryStateSession,
  readLiveMarketSummaryStateSessionScopedSnapshot,
  type BinanceSpot24hPublicRestBaselineObservedAtSource,
  type LiveMarketSummaryBaselineStateOrchestrationResult,
  type LiveMarketUniverseAcquisitionOptions,
  type MarketDataInstrument,
  type MarketDataUnavailable,
} from '../services/market-data';
import { createBinanceSpot24hBrowserPublicRestBaselineAcquisitionPort } from '../services/market-data/providers/binance/binanceSpot24hBrowserPublicRestBaselineAcquisitionBinding';
import { createBinanceSpotExchangeInfoBrowserInstrumentMetadataAcquisitionPort } from '../services/market-data/providers/binance/binanceSpotExchangeInfoBrowserInstrumentMetadataAcquisitionBinding';
import type { HomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionPort } from '../application/dashboard/homeDashboardLiveMarketSummaryScopedSnapshotAcquisitionPort';
import type { AppMarketDataPorts } from './marketDataPorts';
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
  | { readonly ok: false; readonly reason: 'acquisition-failed'; readonly unavailable?: MarketDataUnavailable };

export type HomeDashboardLiveMarketPorts = Pick<AppMarketDataPorts, 'metadata' | 'baseline'>;

export interface BinanceHomeDashboardLiveMarketRuntimeBootstrapOptions {
  readonly universe: LiveMarketUniverseAcquisitionOptions;
  readonly lifecycle?: HomeDashboardLiveMarketSummaryBrowserLifecycleAdapterOptions;
  /** The build's market data ports (U2); without them, today's direct Binance ports with the caller's clock. */
  readonly ports?: HomeDashboardLiveMarketPorts;
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
  const ports = options.ports ?? directPorts(readObservedAt);
  const universeResult = await acquireLiveMarketUniverseOnce(ports.metadata, ports.baseline, options.universe);
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
  const port: HomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionPort = {
    async acquire(scope, acquireOptions) {
      let orchestrationResult: LiveMarketSummaryBaselineStateOrchestrationResult | undefined;
      await session.transition(async (state) => {
        orchestrationResult = await acquireLiveMarketSummaryBaselineIntoState(state, ports.baseline, scope, acquireOptions);
        return orchestrationResult.state;
      });
      if (orchestrationResult === undefined) throw new Error('Home live market: the session transition ended without a result');
      return { orchestrationResult, scopedSnapshot: readLiveMarketSummaryStateSessionScopedSnapshot(session, scope) };
    },
  };
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

/** Today's direct Binance ports with the caller's clock, unchanged (the app passes its typed ports, appMarketDataPorts). */
function directPorts(readObservedAt: BinanceSpot24hPublicRestBaselineObservedAtSource): HomeDashboardLiveMarketPorts {
  return {
    metadata: createBinanceSpotExchangeInfoBrowserInstrumentMetadataAcquisitionPort(),
    baseline: createBinanceSpot24hBrowserPublicRestBaselineAcquisitionPort(readObservedAt),
  };
}
