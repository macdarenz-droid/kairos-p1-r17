import { parseDecimalString, parsePositiveDecimalString } from '../../domain/trades';
import type { DecimalString } from '../../domain/trades';
import type { LiveMarketSummaryFact } from './marketDataTypes';

const ISO_UTC_INSTANT_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

export type LiveMarketSummaryFactValidationResult =
  | { readonly ok: true; readonly fact: LiveMarketSummaryFact }
  | { readonly ok: false; readonly reason:
      | 'instrument-required'
      | 'last-price-invalid'
      | 'open-24h-invalid'
      | 'high-24h-invalid'
      | 'low-24h-invalid'
      | 'base-volume-24h-invalid'
      | 'quote-volume-24h-invalid'
      | 'observed-at-invalid'
      | 'source-timestamp-invalid' };

function isIsoUtcInstant(value: string): boolean {
  if (!ISO_UTC_INSTANT_PATTERN.test(value)) return false;
  return Number.isFinite(Date.parse(value));
}

function isNonNegativeDecimal(value: DecimalString): boolean {
  const parsed = parseDecimalString(value);
  return parsed.ok && !parsed.value.startsWith('-');
}

export function validateLiveMarketSummaryFact(
  fact: LiveMarketSummaryFact,
): LiveMarketSummaryFactValidationResult {
  if (!fact.instrument.venue.trim() || !fact.instrument.symbol.trim()) {
    return { ok: false, reason: 'instrument-required' };
  }
  if (!parsePositiveDecimalString(fact.lastPrice).ok) return { ok: false, reason: 'last-price-invalid' };
  if (!parsePositiveDecimalString(fact.open24h).ok) return { ok: false, reason: 'open-24h-invalid' };
  if (!parsePositiveDecimalString(fact.high24h).ok) return { ok: false, reason: 'high-24h-invalid' };
  if (!parsePositiveDecimalString(fact.low24h).ok) return { ok: false, reason: 'low-24h-invalid' };
  if (!isNonNegativeDecimal(fact.baseVolume24h)) return { ok: false, reason: 'base-volume-24h-invalid' };
  if (!isNonNegativeDecimal(fact.quoteVolume24h)) return { ok: false, reason: 'quote-volume-24h-invalid' };
  if (!isIsoUtcInstant(fact.observedAt)) return { ok: false, reason: 'observed-at-invalid' };
  if (fact.sourceTimestamp !== null && !isIsoUtcInstant(fact.sourceTimestamp)) {
    return { ok: false, reason: 'source-timestamp-invalid' };
  }
  return { ok: true, fact };
}
