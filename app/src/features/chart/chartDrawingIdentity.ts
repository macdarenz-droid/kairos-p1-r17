import type { ChartDrawingId } from './chartDrawingContract';

/**
 * P18.34 provider-neutral chart drawing identity owner.
 *
 * This boundary is the sole allocator for fresh ChartDrawingId values. It uses
 * the same platform UUID mechanism already established elsewhere in Kairos,
 * while remaining independent of trade-domain identity ownership.
 *
 * It deliberately does not construct drawings, inspect draft anchors, dispatch
 * interaction events, mutate the committed drawing collection, persist/restore
 * saved analysis, touch provider APIs, or own P19 Risk/Reward semantics.
 */
export function createChartDrawingId(): ChartDrawingId {
  return crypto.randomUUID();
}
