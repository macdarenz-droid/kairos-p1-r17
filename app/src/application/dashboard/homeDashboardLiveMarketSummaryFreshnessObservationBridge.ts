import {
  evaluateLiveMarketSummaryScopedSnapshotFreshness,
  type LiveMarketSummaryFreshnessEvaluationProjectionResult,
} from '../../services/market-data';
import type { HomeDashboardLiveMarketSummaryAcquisitionLifecycleObserver } from './homeDashboardLiveMarketSummaryAcquisitionLifecycleScheduler';
import type { HomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionResult } from './homeDashboardLiveMarketSummaryScopedSnapshotAcquisitionPort';

/** Caller-owned evaluation-time dependency. This bridge reads it once per resolved lifecycle result. */
export type HomeDashboardLiveMarketSummaryFreshnessEvaluationTimeSource = () => number;

export interface HomeDashboardLiveMarketSummaryFreshnessObservation {
  readonly acquisitionResult: HomeDashboardLiveMarketSummaryScopedSnapshotAcquisitionResult;
  readonly freshnessEvaluation: LiveMarketSummaryFreshnessEvaluationProjectionResult;
}

export interface HomeDashboardLiveMarketSummaryFreshnessObservationSink {
  readonly onObservation?: (
    observation: HomeDashboardLiveMarketSummaryFreshnessObservation,
  ) => void;
  readonly onError?: (error: unknown) => void;
}

/**
 * Provider-neutral bridge from the released Home acquisition lifecycle observer
 * to the released freshness-evaluation projection. Acquisition/session status and
 * per-fact freshness remain separate fields and are never reinterpreted here.
 */
export function createHomeDashboardLiveMarketSummaryFreshnessObservationObserver(
  readEvaluationTimeMs: HomeDashboardLiveMarketSummaryFreshnessEvaluationTimeSource,
  sink: HomeDashboardLiveMarketSummaryFreshnessObservationSink = {},
): HomeDashboardLiveMarketSummaryAcquisitionLifecycleObserver {
  return {
    onResult(result) {
      let evaluationTimeMs: number;
      try {
        evaluationTimeMs = readEvaluationTimeMs();
      } catch (error) {
        sink.onError?.(error);
        return;
      }

      const freshnessEvaluation = evaluateLiveMarketSummaryScopedSnapshotFreshness(
        result.scopedSnapshot,
        evaluationTimeMs,
      );
      sink.onObservation?.({
        acquisitionResult: result,
        freshnessEvaluation,
      });
    },
    onError(error) {
      sink.onError?.(error);
    },
  };
}
