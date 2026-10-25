import type { ChartVisibleLogicalRange } from './chartVisibleRange';

/**
 * Provider-neutral description of loaded series coverage around a logical viewport.
 * Positive values mean loaded bars exist outside the requested range; negative values
 * mean the edge of loaded series data lies inside the requested range.
 */
export interface ChartSeriesLogicalRangeCoverage {
  readonly barsBefore: number;
  readonly barsAfter: number;
}

export interface ChartSeriesLogicalRangeCoveragePort {
  getCoverage(
    range: ChartVisibleLogicalRange,
  ): ChartSeriesLogicalRangeCoverage | null;
}
