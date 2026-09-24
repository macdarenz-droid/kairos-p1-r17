import type { LiveMarketSummaryCompleteForScopeDelivery, MarketDataInstrument } from './marketDataTypes';
import { validateLiveMarketSummaryDelivery } from './liveMarketSummaryDeliverySemantics';

export type LiveMarketSummaryBaselineSuccessValidationResult =
  | { readonly ok: true; readonly delivery: LiveMarketSummaryCompleteForScopeDelivery }
  | { readonly ok: false; readonly reason: 'delivery-invalid' | 'requested-scope-mismatch' };

function instrumentKey(instrument: MarketDataInstrument): string {
  return `${instrument.venue.trim()}::${instrument.symbol.trim()}`;
}

function hasSameScope(
  requestedScope: readonly MarketDataInstrument[],
  deliveredScope: readonly MarketDataInstrument[],
): boolean {
  if (requestedScope.length !== deliveredScope.length) return false;
  const requested = new Set(requestedScope.map(instrumentKey));
  const delivered = new Set(deliveredScope.map(instrumentKey));
  if (requested.size !== requestedScope.length || delivered.size !== deliveredScope.length) return false;
  return [...requested].every((key) => delivered.has(key));
}

/**
 * Validates a successful baseline against canonical P21.3 delivery semantics
 * and against the exact scope requested by the caller.
 */
export function validateLiveMarketSummaryBaselineSuccess(
  requestedScope: readonly MarketDataInstrument[],
  delivery: LiveMarketSummaryCompleteForScopeDelivery,
): LiveMarketSummaryBaselineSuccessValidationResult {
  const deliveryValidation = validateLiveMarketSummaryDelivery(delivery);
  if (!deliveryValidation.ok) return { ok: false, reason: 'delivery-invalid' };
  if (!hasSameScope(requestedScope, delivery.scope)) {
    return { ok: false, reason: 'requested-scope-mismatch' };
  }
  return { ok: true, delivery };
}
