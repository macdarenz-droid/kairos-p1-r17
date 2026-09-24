import {
  acquireLiveMarketUniverseOnce,
  type LiveMarketUniverseAcquisitionOptions,
  type LiveMarketUniverseAcquisitionResult,
} from '../../liveMarketUniverseAcquisitionOrchestration';
import type { BinanceSpot24hPublicRestBaselineObservedAtSource } from './binanceSpot24hPublicRestBaselineAcquisitionAdapter';
import { createBinanceSpot24hBrowserPublicRestBaselineAcquisitionPort } from './binanceSpot24hBrowserPublicRestBaselineAcquisitionBinding';
import { createBinanceSpotExchangeInfoBrowserInstrumentMetadataAcquisitionPort } from './binanceSpotExchangeInfoBrowserInstrumentMetadataAcquisitionBinding';

/**
 * Binance Spot browser-ready dependency binding for the released provider-neutral
 * one-shot Live Market Universe acquisition orchestration. The lower browser
 * acquisition bindings keep transport/mapping ownership; Gate335 keeps universe
 * orchestration/policy delegation; observation time remains caller-owned.
 */
export function acquireBinanceSpotBrowserLiveMarketUniverseOnce(
  readObservedAt: BinanceSpot24hPublicRestBaselineObservedAtSource,
  options: LiveMarketUniverseAcquisitionOptions,
): Promise<LiveMarketUniverseAcquisitionResult> {
  return acquireLiveMarketUniverseOnce(
    createBinanceSpotExchangeInfoBrowserInstrumentMetadataAcquisitionPort(),
    createBinanceSpot24hBrowserPublicRestBaselineAcquisitionPort(readObservedAt),
    options,
  );
}
