import type { DecimalString } from '../../../../domain/trades';
import { validateLiveMarketSummaryFact } from '../../liveMarketSummaryFactSemantics';
import type { LiveMarketSummaryFact } from '../../marketDataTypes';
import { BINANCE_SPOT_VENUE } from './binanceSpotTradeStream';

export type BinanceSpot24hSummaryFactResult =
  | { readonly ok: true; readonly fact: LiveMarketSummaryFact }
  | {
      readonly ok: false;
      readonly reason:
        | 'payload-invalid'
        | 'symbol-invalid'
        | 'last-price-invalid'
        | 'open-price-invalid'
        | 'high-price-invalid'
        | 'low-price-invalid'
        | 'base-volume-invalid'
        | 'quote-volume-invalid'
        | 'close-time-invalid'
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

/** Maps one decoded Binance Spot 24h ticker entry into canonical P21.2 fact truth. */
export function mapBinanceSpot24hSummaryFact(
  payload: unknown,
  observedAt: string,
): BinanceSpot24hSummaryFactResult {
  if (!isRecord(payload)) return { ok: false, reason: 'payload-invalid' };
  if (typeof payload.symbol !== 'string' || !payload.symbol.trim()) return { ok: false, reason: 'symbol-invalid' };
  for (const key of ['lastPrice', 'openPrice', 'highPrice', 'lowPrice', 'volume', 'quoteVolume'] as const) {
    if (typeof payload[key] !== 'string') return { ok: false, reason: 'payload-invalid' };
  }
  if (typeof payload.closeTime !== 'number') return { ok: false, reason: 'close-time-invalid' };
  const sourceTimestamp = toIsoUtcInstant(payload.closeTime);
  if (sourceTimestamp === null) return { ok: false, reason: 'close-time-invalid' };

  const fact: LiveMarketSummaryFact = {
    instrument: { venue: BINANCE_SPOT_VENUE, symbol: payload.symbol },
    lastPrice: payload.lastPrice as DecimalString,
    open24h: payload.openPrice as DecimalString,
    high24h: payload.highPrice as DecimalString,
    low24h: payload.lowPrice as DecimalString,
    baseVolume24h: payload.volume as DecimalString,
    quoteVolume24h: payload.quoteVolume as DecimalString,
    observedAt,
    sourceTimestamp,
  };
  const validated = validateLiveMarketSummaryFact(fact);
  if (!validated.ok) {
    const reasons = {
      'instrument-required': 'symbol-invalid',
      'last-price-invalid': 'last-price-invalid',
      'open-24h-invalid': 'open-price-invalid',
      'high-24h-invalid': 'high-price-invalid',
      'low-24h-invalid': 'low-price-invalid',
      'base-volume-24h-invalid': 'base-volume-invalid',
      'quote-volume-24h-invalid': 'quote-volume-invalid',
      'observed-at-invalid': 'observed-at-invalid',
      'source-timestamp-invalid': 'close-time-invalid',
    } as const;
    return { ok: false, reason: reasons[validated.reason] };
  }
  return { ok: true, fact: validated.fact };
}
