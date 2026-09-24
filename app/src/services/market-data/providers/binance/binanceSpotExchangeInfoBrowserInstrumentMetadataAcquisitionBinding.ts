import type { LiveMarketUniverseInstrumentMetadataAcquisitionPort } from '../../LiveMarketUniverseInstrumentMetadataAcquisitionPort';
import { createBinanceSpotExchangeInfoInstrumentMetadataAcquisitionPort } from './binanceSpotExchangeInfoInstrumentMetadataAcquisitionAdapter';
import { connectBinanceSpotExchangeInfoBrowserPublicRestRequest } from './binanceSpotExchangeInfoBrowserPublicRestConnector';

/**
 * Browser-ready composition of the released Binance Spot exchangeInfo
 * metadata acquisition adapter and browser public REST connector.
 * Universe policy, freshness/cadence, state, and UI remain separate owners.
 */
export function createBinanceSpotExchangeInfoBrowserInstrumentMetadataAcquisitionPort():
  LiveMarketUniverseInstrumentMetadataAcquisitionPort {
  return createBinanceSpotExchangeInfoInstrumentMetadataAcquisitionPort(
    connectBinanceSpotExchangeInfoBrowserPublicRestRequest,
  );
}
