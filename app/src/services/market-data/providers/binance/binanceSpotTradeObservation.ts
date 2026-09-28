import { parsePositiveDecimalString } from '../../../../domain/trades';
import { validateMarketPriceObservation } from '../../marketDataObservationSemantics';
import type { MarketPriceObservation } from '../../marketDataTypes';
import { BINANCE_SPOT_VENUE } from './binanceSpotTradeStream';

export type BinanceSpotTradeObservationResult =
  | { readonly ok: true; readonly observation: MarketPriceObservation }
  | {
      readonly ok: false;
      readonly reason:
        | 'payload-invalid'
        | 'event-type-invalid'
        | 'symbol-invalid'
        | 'price-invalid'
        | 'trade-time-invalid'
        | 'observed-at-invalid';
    };

type UnknownRecord = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toIsoUtcInstant(epochMs: number): string | null {
  if (!Number.isSafeInteger(epochMs) || epochMs < 0) return null;
  const instant = new Date(epochMs);
  return Number.isNaN(instant.getTime()) ? null : instant.toISOString();
}

/**
 * Maps one Binance Spot raw trade event into the provider-neutral P15
 * market-price observation contract.
 *
 * `observedAt` is supplied by the caller so provider mapping never becomes
 * a second receipt-clock owner.
 */
export function mapBinanceSpotTradeObservation(
  payload: unknown,
  observedAt: string,
): BinanceSpotTradeObservationResult {
  if (!isRecord(payload)) {
    return { ok: false, reason: 'payload-invalid' };
  }

  if (payload.e !== 'trade') {
    return { ok: false, reason: 'event-type-invalid' };
  }

  if (typeof payload.s !== 'string' || !payload.s.trim()) {
    return { ok: false, reason: 'symbol-invalid' };
  }

  if (typeof payload.p !== 'string') {
    return { ok: false, reason: 'price-invalid' };
  }

  const parsedPrice = parsePositiveDecimalString(payload.p);
  if (!parsedPrice.ok) {
    return { ok: false, reason: 'price-invalid' };
  }

  if (typeof payload.T !== 'number') {
    return { ok: false, reason: 'trade-time-invalid' };
  }

  const sourceTimestamp = toIsoUtcInstant(payload.T);
  if (sourceTimestamp === null) {
    return { ok: false, reason: 'trade-time-invalid' };
  }

  const observation: MarketPriceObservation = {
    instrument: {
      venue: BINANCE_SPOT_VENUE,
      symbol: payload.s,
    },
    price: parsedPrice.value,
    observedAt,
    sourceTimestamp,
  };

  const validated = validateMarketPriceObservation(observation);
  if (!validated.ok) {
    if (validated.reason === 'observed-at-invalid') {
      return { ok: false, reason: 'observed-at-invalid' };
    }
    return { ok: false, reason: 'payload-invalid' };
  }

  return { ok: true, observation: validated.observation };
}
