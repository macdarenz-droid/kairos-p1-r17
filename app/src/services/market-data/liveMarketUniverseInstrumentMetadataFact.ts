import type { MarketDataInstrument } from './marketDataTypes';

/**
 * Provider-neutral current instrument metadata needed by later universe policy.
 * This is raw market/provider truth only; it does not select, rank, filter, or limit a universe.
 */
export interface LiveMarketUniverseInstrumentMetadataFact {
  readonly instrument: MarketDataInstrument;
  readonly baseAsset: string;
  readonly quoteAsset: string;
  readonly tradingEnabled: boolean;
}

export type LiveMarketUniverseInstrumentMetadataFactValidationResult =
  | { readonly ok: true; readonly fact: LiveMarketUniverseInstrumentMetadataFact }
  | { readonly ok: false; readonly reason:
      | 'instrument-required'
      | 'base-asset-required'
      | 'quote-asset-required'
      | 'trading-enabled-invalid' };

export function validateLiveMarketUniverseInstrumentMetadataFact(
  fact: LiveMarketUniverseInstrumentMetadataFact,
): LiveMarketUniverseInstrumentMetadataFactValidationResult {
  if (!fact.instrument.venue.trim() || !fact.instrument.symbol.trim()) {
    return { ok: false, reason: 'instrument-required' };
  }
  if (!fact.baseAsset.trim()) return { ok: false, reason: 'base-asset-required' };
  if (!fact.quoteAsset.trim()) return { ok: false, reason: 'quote-asset-required' };
  if (typeof fact.tradingEnabled !== 'boolean') {
    return { ok: false, reason: 'trading-enabled-invalid' };
  }
  return { ok: true, fact };
}
