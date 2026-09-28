import type { LiveMarketUniverseInstrumentMetadataAcquisitionPort } from '../../LiveMarketUniverseInstrumentMetadataAcquisitionPort';
import { composeBinanceSpotExchangeInfoPublicRestRoundTrip } from './binanceSpotExchangeInfoPublicRestRoundTrip';
import type { BinanceSpotExchangeInfoPublicRestRequestConnector } from './binanceSpotExchangeInfoPublicRestRequestExecution';

/**
 * Binance Spot implementation of the provider-neutral instrument metadata
 * acquisition port. Concrete transport remains injected by the caller.
 * Universe selection/ranking and freshness/cadence remain separate owners.
 */
export function createBinanceSpotExchangeInfoInstrumentMetadataAcquisitionPort(
  connect: BinanceSpotExchangeInfoPublicRestRequestConnector<unknown>,
): LiveMarketUniverseInstrumentMetadataAcquisitionPort {
  return {
    async acquireInstrumentMetadata(options) {
      try {
        const result = await composeBinanceSpotExchangeInfoPublicRestRoundTrip(connect, options);
        if (!result.ok) return { ok: false, reason: 'acquisition-failed' };
        return { ok: true, facts: result.facts };
      } catch {
        return { ok: false, reason: 'acquisition-failed' };
      }
    },
  };
}
