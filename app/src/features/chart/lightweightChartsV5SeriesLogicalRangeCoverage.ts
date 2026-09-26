import type {
  ChartSeriesLogicalRangeCoveragePort,
} from './chartSeriesLogicalRangeCoverage';
import type { ChartVisibleLogicalRange } from './chartVisibleRange';

export interface LightweightChartsV5BarsInfo {
  readonly barsBefore: number;
  readonly barsAfter: number;
}

export interface LightweightChartsV5SeriesLogicalRangeApi {
  barsInLogicalRange(
    range: ChartVisibleLogicalRange,
  ): LightweightChartsV5BarsInfo | null;
}

/**
 * Maps Lightweight Charts v5 series coverage evidence into Kairos' provider-neutral
 * chart boundary. This does not decide when or how historical data is fetched.
 */
export function createLightweightChartsV5SeriesLogicalRangeCoveragePort(
  series: LightweightChartsV5SeriesLogicalRangeApi,
): ChartSeriesLogicalRangeCoveragePort {
  return {
    getCoverage(range) {
      const info = series.barsInLogicalRange(range);
      if (info === null) return null;

      return {
        barsBefore: info.barsBefore,
        barsAfter: info.barsAfter,
      };
    },
  };
}
