import type { LiveMarketUniverseInstrumentMetadataFact } from '../../liveMarketUniverseInstrumentMetadataFact';
import {
  mapBinanceSpotExchangeInfoInstrumentMetadataFactCollection,
  type BinanceSpotExchangeInfoInstrumentMetadataFactCollectionResult,
} from './binanceSpotExchangeInfoInstrumentMetadataFactCollection';

export type BinanceSpotExchangeInfoInstrumentMetadataFactResponseResult =
  | { readonly ok: true; readonly facts: readonly LiveMarketUniverseInstrumentMetadataFact[] }
  | { readonly ok: false; readonly reason: 'response-invalid' }
  | Extract<BinanceSpotExchangeInfoInstrumentMetadataFactCollectionResult, { readonly ok: false }>;

type UnknownRecord = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Interprets one whole already-decoded Binance Spot exchangeInfo response object
 * only far enough to extract its `symbols` value and delegate that value unchanged
 * to the released metadata-fact collection mapper.
 */
export function mapBinanceSpotExchangeInfoInstrumentMetadataFactResponse(
  response: unknown,
): BinanceSpotExchangeInfoInstrumentMetadataFactResponseResult {
  if (!isRecord(response)) return { ok: false, reason: 'response-invalid' };
  return mapBinanceSpotExchangeInfoInstrumentMetadataFactCollection(response.symbols);
}
