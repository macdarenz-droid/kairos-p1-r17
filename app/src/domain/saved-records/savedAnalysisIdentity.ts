import type { SavedAnalysisId } from './savedAnalysisContract';

/**
 * P20.1 Saved Analysis identity owner.
 *
 * This boundary is the sole allocator for fresh SavedAnalysisId values.
 * It uses the same platform UUID mechanism already established for other
 * stable Kairos identities while remaining independent of drawing and
 * Risk/Reward identities.
 */
export function createSavedAnalysisId(): SavedAnalysisId {
  return crypto.randomUUID();
}
