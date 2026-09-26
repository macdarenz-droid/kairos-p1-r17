import type {
  LiveMarketSummaryDelivery,
  LiveMarketSummaryFact,
  MarketDataInstrument,
} from './marketDataTypes';
import { validateLiveMarketSummaryDelivery } from './liveMarketSummaryDeliverySemantics';

/**
 * Provider-neutral current summary facts keyed only by instrument identity.
 * Map iteration order is storage detail, never ranking or presentation truth.
 */
export interface LiveMarketSummaryDeliveryState {
  readonly factsByInstrument: ReadonlyMap<string, LiveMarketSummaryFact>;
}

export type LiveMarketSummaryDeliveryStateApplyResult =
  | { readonly ok: true; readonly state: LiveMarketSummaryDeliveryState }
  | { readonly ok: false; readonly reason: 'delivery-invalid'; readonly state: LiveMarketSummaryDeliveryState };

function instrumentKey(instrument: MarketDataInstrument): string {
  return `${instrument.venue.trim()}::${instrument.symbol.trim()}`;
}

export function createLiveMarketSummaryDeliveryState(): LiveMarketSummaryDeliveryState {
  return { factsByInstrument: new Map<string, LiveMarketSummaryFact>() };
}

export function getLiveMarketSummaryDeliveryStateFact(
  state: LiveMarketSummaryDeliveryState,
  instrument: MarketDataInstrument,
): LiveMarketSummaryFact | null {
  return state.factsByInstrument.get(instrumentKey(instrument)) ?? null;
}

/**
 * Apply one already-validated delivery contract without acquiring data,
 * selecting a universe, comparing timestamps, or introducing freshness/ranking policy.
 * Incremental deliveries upsert only delivered instruments. Complete-for-scope
 * deliveries replace only their explicit scope and preserve all out-of-scope facts.
 */
export function applyLiveMarketSummaryDeliveryState(
  state: LiveMarketSummaryDeliveryState,
  delivery: LiveMarketSummaryDelivery,
): LiveMarketSummaryDeliveryStateApplyResult {
  if (!validateLiveMarketSummaryDelivery(delivery).ok) {
    return { ok: false, reason: 'delivery-invalid', state };
  }

  const next = new Map(state.factsByInstrument);
  if (delivery.completeness === 'complete-for-scope') {
    for (const instrument of delivery.scope) next.delete(instrumentKey(instrument));
  }
  for (const fact of delivery.facts) next.set(instrumentKey(fact.instrument), fact);

  return { ok: true, state: { factsByInstrument: next } };
}
