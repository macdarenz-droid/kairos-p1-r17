import type {
  LiveMarketSummaryBaselineAcquisitionPort,
  LiveMarketSummaryBaselineAcquisitionResult,
} from './LiveMarketSummaryBaselineAcquisitionPort';
import type { MarketDataInstrument } from './marketDataTypes';
import {
  applyLiveMarketSummaryDeliveryState,
  type LiveMarketSummaryDeliveryState,
} from './liveMarketSummaryDeliveryState';

export type LiveMarketSummaryBaselineStateOrchestrationResult =
  | { readonly ok: true; readonly state: LiveMarketSummaryDeliveryState }
  | {
      readonly ok: false;
      readonly reason: 'acquisition-failed' | 'delivery-invalid';
      readonly state: LiveMarketSummaryDeliveryState;
    };

/**
 * Provider-neutral composition of the released baseline acquisition port and
 * current-summary delivery state. Scope, cancellation, clocks, scheduling,
 * freshness, ranking, persistence, and UI remain caller/upstream ownership.
 */
export async function acquireLiveMarketSummaryBaselineIntoState(
  state: LiveMarketSummaryDeliveryState,
  acquisitionPort: LiveMarketSummaryBaselineAcquisitionPort,
  scope: readonly MarketDataInstrument[],
  options?: { readonly signal?: AbortSignal },
): Promise<LiveMarketSummaryBaselineStateOrchestrationResult> {
  const acquisition: LiveMarketSummaryBaselineAcquisitionResult =
    options === undefined
      ? await acquisitionPort.acquireBaseline(scope)
      : await acquisitionPort.acquireBaseline(scope, options);

  if (!acquisition.ok) {
    return { ok: false, reason: 'acquisition-failed', state };
  }

  const applied = applyLiveMarketSummaryDeliveryState(state, acquisition.delivery);
  if (!applied.ok) {
    return { ok: false, reason: 'delivery-invalid', state: applied.state };
  }
  return { ok: true, state: applied.state };
}
