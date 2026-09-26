import { mapBinanceSpotExchangeInfoInstrumentMetadataFactResponse } from './binanceSpotExchangeInfoInstrumentMetadataFactResponse';
import { decodeBinanceSpotExchangeInfoPublicRestResponse } from './binanceSpotExchangeInfoPublicRestResponseDecode';

/**
 * Composes one already-received Binance Spot exchangeInfo response-data
 * value through the released JSON-text decoder and the released whole
 * decoded-response metadata-fact mapper.
 *
 * Request description/execution, concrete transport/HTTP response
 * acquisition, round-trip orchestration, universe/ranking policy,
 * freshness/cadence and UI remain outside this boundary.
 */
export function mapBinanceSpotExchangeInfoPublicRestResponseDelivery(data: unknown) {
  const decoded = decodeBinanceSpotExchangeInfoPublicRestResponse(data);
  if (!decoded.ok) return decoded;
  return mapBinanceSpotExchangeInfoInstrumentMetadataFactResponse(decoded.payload);
}
