import type { ChartVisibleLogicalRange, ChartVisibleRangePort } from './chartVisibleRange';
import type {
  ChartSeriesLogicalRangeCoverage,
  ChartSeriesLogicalRangeCoveragePort,
} from './chartSeriesLogicalRangeCoverage';

export interface ChartViewportHistoryDemandPolicy {
  readonly minimumBarsBefore: number;
}

export interface ChartViewportHistoryDemandSignal {
  readonly visibleRange: ChartVisibleLogicalRange;
  readonly coverage: ChartSeriesLogicalRangeCoverage;
  readonly minimumBarsBefore: number;
  readonly barsBeforeShortfall: number;
}

export type ChartViewportHistoryDemandListener = (
  demand: ChartViewportHistoryDemandSignal | null,
) => void;

export interface ChartViewportHistoryDemandPort {
  getCurrentDemand(): ChartViewportHistoryDemandSignal | null;
  subscribeDemandChange(listener: ChartViewportHistoryDemandListener): () => void;
}

function validatePolicy(policy: ChartViewportHistoryDemandPolicy): void {
  if (!Number.isFinite(policy.minimumBarsBefore) || policy.minimumBarsBefore < 0) {
    throw new RangeError('minimumBarsBefore must be a finite non-negative number');
  }
}

function evaluateDemand(
  range: ChartVisibleLogicalRange | null,
  coveragePort: ChartSeriesLogicalRangeCoveragePort,
  policy: ChartViewportHistoryDemandPolicy,
): ChartViewportHistoryDemandSignal | null {
  if (range === null) return null;

  const coverage = coveragePort.getCoverage(range);
  if (coverage === null || coverage.barsBefore >= policy.minimumBarsBefore) {
    return null;
  }

  return {
    visibleRange: range,
    coverage,
    minimumBarsBefore: policy.minimumBarsBefore,
    barsBeforeShortfall: policy.minimumBarsBefore - coverage.barsBefore,
  };
}

/**
 * Composes viewport observation with loaded-series coverage into a provider-neutral
 * demand signal. The caller injects policy and remains responsible for deciding
 * whether/how historical market data is acquired.
 */
export function createChartViewportHistoryDemandPort(
  visibleRangePort: ChartVisibleRangePort,
  coveragePort: ChartSeriesLogicalRangeCoveragePort,
  policy: ChartViewportHistoryDemandPolicy,
): ChartViewportHistoryDemandPort {
  validatePolicy(policy);

  return {
    getCurrentDemand() {
      return evaluateDemand(
        visibleRangePort.getVisibleLogicalRange(),
        coveragePort,
        policy,
      );
    },

    subscribeDemandChange(listener) {
      return visibleRangePort.subscribeVisibleLogicalRangeChange((range) => {
        listener(evaluateDemand(range, coveragePort, policy));
      });
    },
  };
}
