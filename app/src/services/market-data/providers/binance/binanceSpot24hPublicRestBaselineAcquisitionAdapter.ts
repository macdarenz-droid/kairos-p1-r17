import type { LiveMarketSummaryBaselineAcquisitionPort } from '../../LiveMarketSummaryBaselineAcquisitionPort';
import type { MarketDataInstrument, LiveMarketSummaryCompleteForScopeDelivery } from '../../marketDataTypes';
import { validateLiveMarketSummaryBaselineSuccess } from '../../liveMarketSummaryBaselineAcquisitionSemantics';
import {
  composeBinanceSpot24hPublicRestBaselineRoundTrip,
} from './binanceSpot24hPublicRestBaselineRoundTrip';
import type {
  BinanceSpot24hPublicRestBaselineRequestConnector,
} from './binanceSpot24hPublicRestBaselineRequestExecution';

/**
 * Caller-owned observation-time dependency. The adapter reads it once per
 * baseline acquisition and does not own clock, freshness, or timestamp policy.
 */
export type BinanceSpot24hPublicRestBaselineObservedAtSource = () => string;

// Binance's `symbols` parameter accepts at most 100 symbols per request.
// Keep batching at this provider boundary; callers still receive one complete
// delivery for their original explicit scope.
export const BINANCE_SPOT_24H_BASELINE_MAX_SYMBOLS_PER_REQUEST = 100 as const;

function splitIntoRequestBatches(
  scope: readonly MarketDataInstrument[],
): readonly (readonly MarketDataInstrument[])[] {
  const batches: Array<readonly MarketDataInstrument[]> = [];
  for (let index = 0; index < scope.length; index += BINANCE_SPOT_24H_BASELINE_MAX_SYMBOLS_PER_REQUEST) {
    batches.push(scope.slice(index, index + BINANCE_SPOT_24H_BASELINE_MAX_SYMBOLS_PER_REQUEST));
  }
  return batches;
}

/**
 * Concrete Binance composition for the provider-neutral P21.4 baseline port.
 * Network transport remains injected. P21.12 caller cancellation is forwarded
 * unchanged through the existing round-trip seam.
 */
export function createBinanceSpot24hPublicRestBaselineAcquisitionPort(
  connect: BinanceSpot24hPublicRestBaselineRequestConnector<unknown>,
  readObservedAt: BinanceSpot24hPublicRestBaselineObservedAtSource,
): LiveMarketSummaryBaselineAcquisitionPort {
  return {
    async acquireBaseline(scope, options) {
      try {
        const observedAt = readObservedAt();
        const facts = [] as LiveMarketSummaryCompleteForScopeDelivery['facts'][number][];
        for (const batch of splitIntoRequestBatches(scope)) {
          const result = await composeBinanceSpot24hPublicRestBaselineRoundTrip(
            batch,
            observedAt,
            connect,
            options,
          );
          if (!result.ok) return { ok: false, reason: 'acquisition-failed' };
          facts.push(...result.delivery.facts);
        }
        const delivery: LiveMarketSummaryCompleteForScopeDelivery = {
          completeness: 'complete-for-scope',
          scope: [...scope],
          facts,
        };
        const result = { ok: true as const, delivery };
        const validated = validateLiveMarketSummaryBaselineSuccess(scope, result.delivery);
        if (!validated.ok) return { ok: false, reason: 'acquisition-failed' };
        return { ok: true, delivery: validated.delivery };
      } catch {
        return { ok: false, reason: 'acquisition-failed' };
      }
    },
  };
}
