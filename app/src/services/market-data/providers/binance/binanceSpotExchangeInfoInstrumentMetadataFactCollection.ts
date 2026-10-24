import type { LiveMarketUniverseInstrumentMetadataFact } from '../../liveMarketUniverseInstrumentMetadataFact';
import {
  mapBinanceSpotExchangeInfoInstrumentMetadataFact,
  type BinanceSpotExchangeInfoInstrumentMetadataFactResult,
} from './binanceSpotExchangeInfoInstrumentMetadataFact';

export type BinanceSpotExchangeInfoInstrumentMetadataFactCollectionResult =
  | {
      readonly ok: true;
      readonly facts: readonly LiveMarketUniverseInstrumentMetadataFact[];
    }
  | { readonly ok: false; readonly reason: 'collection-invalid' }
  | {
      readonly ok: false;
      readonly reason: 'entry-invalid';
      readonly index: number;
      readonly entryReason: Extract<BinanceSpotExchangeInfoInstrumentMetadataFactResult, { readonly ok: false }>['reason'];
    };

/**
 * Maps one explicitly supplied decoded Binance Spot exchangeInfo symbol collection
 * into provider-neutral metadata facts in the exact caller-supplied sequence.
 * Universe selection/filtering/ranking remains outside this provider composition.
 */
export function mapBinanceSpotExchangeInfoInstrumentMetadataFactCollection(
  symbols: unknown,
): BinanceSpotExchangeInfoInstrumentMetadataFactCollectionResult {
  if (!Array.isArray(symbols)) return { ok: false, reason: 'collection-invalid' };

  const facts: LiveMarketUniverseInstrumentMetadataFact[] = [];
  for (let index = 0; index < symbols.length; index += 1) {
    const mapped = mapBinanceSpotExchangeInfoInstrumentMetadataFact(symbols[index]);
    if (!mapped.ok) {
      return {
        ok: false,
        reason: 'entry-invalid',
        index,
        entryReason: mapped.reason,
      };
    }
    facts.push(mapped.fact);
  }

  return { ok: true, facts };
}
