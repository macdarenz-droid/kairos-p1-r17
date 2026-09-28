import { validateLiveMarketUniverseInstrumentMetadataFact } from '../../liveMarketUniverseInstrumentMetadataFact';
import type { LiveMarketUniverseInstrumentMetadataFact } from '../../liveMarketUniverseInstrumentMetadataFact';
import { BINANCE_SPOT_VENUE } from './binanceSpotTradeStream';

export type BinanceSpotExchangeInfoInstrumentMetadataFactResult =
  | { readonly ok: true; readonly fact: LiveMarketUniverseInstrumentMetadataFact }
  | {
      readonly ok: false;
      readonly reason:
        | 'payload-invalid'
        | 'symbol-invalid'
        | 'status-invalid'
        | 'base-asset-invalid'
        | 'quote-asset-invalid';
    };

type UnknownRecord = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Maps one already-decoded Binance Spot exchangeInfo symbol object into one
 * provider-neutral instrument metadata fact. Universe selection/ranking remains
 * outside this provider mapper.
 */
export function mapBinanceSpotExchangeInfoInstrumentMetadataFact(
  payload: unknown,
): BinanceSpotExchangeInfoInstrumentMetadataFactResult {
  if (!isRecord(payload)) return { ok: false, reason: 'payload-invalid' };
  if (typeof payload.symbol !== 'string' || !payload.symbol.trim()) {
    return { ok: false, reason: 'symbol-invalid' };
  }
  if (typeof payload.status !== 'string' || !payload.status.trim()) {
    return { ok: false, reason: 'status-invalid' };
  }
  if (typeof payload.baseAsset !== 'string' || !payload.baseAsset.trim()) {
    return { ok: false, reason: 'base-asset-invalid' };
  }
  if (typeof payload.quoteAsset !== 'string' || !payload.quoteAsset.trim()) {
    return { ok: false, reason: 'quote-asset-invalid' };
  }

  const fact: LiveMarketUniverseInstrumentMetadataFact = {
    instrument: { venue: BINANCE_SPOT_VENUE, symbol: payload.symbol },
    baseAsset: payload.baseAsset,
    quoteAsset: payload.quoteAsset,
    tradingEnabled: payload.status === 'TRADING',
  };

  const validated = validateLiveMarketUniverseInstrumentMetadataFact(fact);
  if (!validated.ok) {
    const reasons = {
      'instrument-required': 'symbol-invalid',
      'base-asset-required': 'base-asset-invalid',
      'quote-asset-required': 'quote-asset-invalid',
      'trading-enabled-invalid': 'status-invalid',
    } as const;
    return { ok: false, reason: reasons[validated.reason] };
  }

  return { ok: true, fact: validated.fact };
}
