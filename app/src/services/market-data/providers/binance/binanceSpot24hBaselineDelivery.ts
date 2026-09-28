import { validateLiveMarketSummaryBaselineSuccess } from '../../liveMarketSummaryBaselineAcquisitionSemantics';
import type {
  LiveMarketSummaryCompleteForScopeDelivery,
  MarketDataInstrument,
} from '../../marketDataTypes';
import { mapBinanceSpot24hSummaryFact } from './binanceSpot24hSummaryFact';

export type BinanceSpot24hBaselineDeliveryResult =
  | { readonly ok: true; readonly delivery: LiveMarketSummaryCompleteForScopeDelivery }
  | {
      readonly ok: false;
      readonly reason:
        | 'payload-invalid'
        | 'fact-mapping-failed'
        | 'delivery-invalid'
        | 'requested-scope-mismatch';
    };

function normalizeTickerEntries(payload: unknown): readonly unknown[] | null {
  if (Array.isArray(payload)) return payload;
  if (typeof payload === 'object' && payload !== null) return [payload];
  return null;
}

/**
 * Purely composes a decoded Binance Spot 24h ticker payload into a canonical
 * P21.3 complete-for-scope baseline for an explicit caller-owned scope.
 * Query shape, batching and transport remain outside this mapper.
 */
export function mapBinanceSpot24hBaselineDelivery(
  scope: readonly MarketDataInstrument[],
  payload: unknown,
  observedAt: string,
): BinanceSpot24hBaselineDeliveryResult {
  const entries = normalizeTickerEntries(payload);
  if (entries === null) return { ok: false, reason: 'payload-invalid' };

  const facts = [];
  for (const entry of entries) {
    const mapped = mapBinanceSpot24hSummaryFact(entry, observedAt);
    if (!mapped.ok) return { ok: false, reason: 'fact-mapping-failed' };
    facts.push(mapped.fact);
  }

  const delivery: LiveMarketSummaryCompleteForScopeDelivery = {
    completeness: 'complete-for-scope',
    scope,
    facts,
  };
  const validated = validateLiveMarketSummaryBaselineSuccess(scope, delivery);
  if (!validated.ok) return { ok: false, reason: validated.reason };
  return { ok: true, delivery: validated.delivery };
}
