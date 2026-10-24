import { parsePositiveDecimalString } from '../../domain/trades';
import type { MarketPriceObservation } from './marketDataTypes';

const ISO_UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export type MarketObservationValidationResult =
  | { readonly ok: true; readonly observation: MarketPriceObservation }
  | { readonly ok: false; readonly reason: 'instrument-required' | 'price-invalid' | 'observed-at-invalid' | 'source-timestamp-invalid' };

export type MarketObservationFreshness = 'fresh' | 'stale' | 'future' | 'invalid';

export function parseIsoUtcInstant(value: string): number | null {
  if (!ISO_UTC_INSTANT_PATTERN.test(value)) return null;
  const epochMs = Date.parse(value);
  return Number.isFinite(epochMs) ? epochMs : null;
}

export function validateMarketPriceObservation(
  observation: MarketPriceObservation,
): MarketObservationValidationResult {
  if (!observation.instrument.venue.trim() || !observation.instrument.symbol.trim()) {
    return { ok: false, reason: 'instrument-required' };
  }
  if (!parsePositiveDecimalString(observation.price).ok) {
    return { ok: false, reason: 'price-invalid' };
  }
  if (parseIsoUtcInstant(observation.observedAt) === null) {
    return { ok: false, reason: 'observed-at-invalid' };
  }
  if (
    observation.sourceTimestamp !== null
    && parseIsoUtcInstant(observation.sourceTimestamp) === null
  ) {
    return { ok: false, reason: 'source-timestamp-invalid' };
  }
  return { ok: true, observation };
}

/**
 * Classifies freshness from the application-owned receipt time only.
 * Provider/source timestamps are retained as evidence but never drive freshness.
 * The caller supplies `now` so this module does not create a second clock owner.
 */
export function assessMarketObservationFreshness(
  observation: MarketPriceObservation,
  now: string,
  maxAgeMs: number,
): MarketObservationFreshness {
  if (!validateMarketPriceObservation(observation).ok) return 'invalid';
  const observedAtMs = parseIsoUtcInstant(observation.observedAt);
  const nowMs = parseIsoUtcInstant(now);
  if (observedAtMs === null || nowMs === null || !Number.isFinite(maxAgeMs) || maxAgeMs < 0) {
    return 'invalid';
  }
  if (observedAtMs > nowMs) return 'future';
  return nowMs - observedAtMs <= maxAgeMs ? 'fresh' : 'stale';
}
