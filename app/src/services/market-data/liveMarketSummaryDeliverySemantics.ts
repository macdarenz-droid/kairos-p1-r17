import type {
  LiveMarketSummaryDelivery,
  LiveMarketSummaryFact,
  MarketDataInstrument,
} from './marketDataTypes';
import { validateLiveMarketSummaryFact } from './liveMarketSummaryFactSemantics';

export type LiveMarketSummaryDeliveryValidationResult =
  | { readonly ok: true; readonly delivery: LiveMarketSummaryDelivery }
  | { readonly ok: false; readonly reason:
      | 'facts-required'
      | 'fact-invalid'
      | 'scope-required'
      | 'scope-instrument-invalid'
      | 'scope-instrument-duplicate'
      | 'fact-instrument-duplicate'
      | 'fact-outside-scope'
      | 'scope-fact-missing' };

function instrumentKey(instrument: MarketDataInstrument): string {
  return `${instrument.venue.trim()}::${instrument.symbol.trim()}`;
}

function isInstrumentValid(instrument: MarketDataInstrument): boolean {
  return instrument.venue.trim().length > 0 && instrument.symbol.trim().length > 0;
}

function hasDuplicateInstruments(instruments: readonly MarketDataInstrument[]): boolean {
  const keys = instruments.map(instrumentKey);
  return new Set(keys).size !== keys.length;
}

function hasDuplicateFactInstruments(facts: readonly LiveMarketSummaryFact[]): boolean {
  const keys = facts.map((fact) => instrumentKey(fact.instrument));
  return new Set(keys).size !== keys.length;
}

export function validateLiveMarketSummaryDelivery(
  delivery: LiveMarketSummaryDelivery,
): LiveMarketSummaryDeliveryValidationResult {
  if (delivery.facts.length === 0) return { ok: false, reason: 'facts-required' };
  if (delivery.facts.some((fact) => !validateLiveMarketSummaryFact(fact).ok)) {
    return { ok: false, reason: 'fact-invalid' };
  }
  if (hasDuplicateFactInstruments(delivery.facts)) {
    return { ok: false, reason: 'fact-instrument-duplicate' };
  }

  if (delivery.completeness === 'incremental') {
    return { ok: true, delivery };
  }

  if (delivery.scope.length === 0) return { ok: false, reason: 'scope-required' };
  if (delivery.scope.some((instrument) => !isInstrumentValid(instrument))) {
    return { ok: false, reason: 'scope-instrument-invalid' };
  }
  if (hasDuplicateInstruments(delivery.scope)) {
    return { ok: false, reason: 'scope-instrument-duplicate' };
  }

  const scopeKeys = new Set(delivery.scope.map(instrumentKey));
  const factKeys = new Set(delivery.facts.map((fact) => instrumentKey(fact.instrument)));
  if ([...factKeys].some((key) => !scopeKeys.has(key))) {
    return { ok: false, reason: 'fact-outside-scope' };
  }
  if ([...scopeKeys].some((key) => !factKeys.has(key))) {
    return { ok: false, reason: 'scope-fact-missing' };
  }

  return { ok: true, delivery };
}
