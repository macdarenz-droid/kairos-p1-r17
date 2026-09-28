import type { MarketDataInstrument } from './marketDataTypes';
import type { LiveMarketSummaryStateSession } from './liveMarketSummaryStateSession';
import {
  readLiveMarketSummaryScopedStateSnapshot,
  type LiveMarketSummaryScopedStateSnapshotEntry,
} from './liveMarketSummaryScopedStateSnapshot';

/**
 * Pure binding from the released P21.19 state-session snapshot seam to
 * the released P21.21 caller-scoped read projection. One invocation
 * observes the session exactly once and adds no lifecycle or UI policy.
 */
export function readLiveMarketSummaryStateSessionScopedSnapshot(
  session: LiveMarketSummaryStateSession,
  scope: readonly MarketDataInstrument[],
): readonly LiveMarketSummaryScopedStateSnapshotEntry[] {
  const state = session.getState();
  return readLiveMarketSummaryScopedStateSnapshot(state, scope);
}
