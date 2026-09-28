import { describe, expect, it, vi } from 'vitest';
import {
  createLightweightChartsV5SeriesLogicalRangeCoveragePort,
  type LightweightChartsV5SeriesLogicalRangeApi,
} from '../src/features/chart';

describe('P17.14 series logical range coverage boundary', () => {
  it('maps bars before and after without inventing history policy', () => {
    const barsInLogicalRange = vi.fn(() => ({
      barsBefore: 12,
      barsAfter: -3,
      from: 1_700_000_000,
      to: 1_700_000_600,
    }));

    const series: LightweightChartsV5SeriesLogicalRangeApi = {
      barsInLogicalRange,
    };
    const range = { from: -2.5, to: 24.75 };

    expect(
      createLightweightChartsV5SeriesLogicalRangeCoveragePort(series)
        .getCoverage(range),
    ).toEqual({ barsBefore: 12, barsAfter: -3 });
    expect(barsInLogicalRange).toHaveBeenCalledTimes(1);
    expect(barsInLogicalRange).toHaveBeenCalledWith(range);
  });

  it('preserves null when the vendor reports no series data for the range', () => {
    const series: LightweightChartsV5SeriesLogicalRangeApi = {
      barsInLogicalRange: () => null,
    };

    expect(
      createLightweightChartsV5SeriesLogicalRangeCoveragePort(series)
        .getCoverage({ from: 0, to: 10 }),
    ).toBeNull();
  });
});
