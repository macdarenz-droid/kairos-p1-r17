import { describe, expect, it, vi } from 'vitest';
import {
  createChartViewportHistoryDemandPort,
  type ChartSeriesLogicalRangeCoveragePort,
  type ChartVisibleLogicalRangeListener,
  type ChartVisibleRangePort,
} from '../src/features/chart';

function visibleRangePort(
  current: { from: number; to: number } | null,
) {
  let listener: ChartVisibleLogicalRangeListener | null = null;
  const unsubscribe = vi.fn();
  const port: ChartVisibleRangePort = {
    getVisibleLogicalRange: () => current,
    subscribeVisibleLogicalRangeChange(next) {
      listener = next;
      return unsubscribe;
    },
  };

  return {
    port,
    emit(range: { from: number; to: number } | null) {
      listener?.(range);
    },
    unsubscribe,
  };
}

describe('P17.15 chart viewport history demand composition', () => {
  it('emits demand only when injected minimum bars-before policy is unmet', () => {
    const visible = visibleRangePort({ from: -5, to: 20 });
    const coverage: ChartSeriesLogicalRangeCoveragePort = {
      getCoverage: vi.fn(() => ({ barsBefore: 12, barsAfter: 4 })),
    };

    const port = createChartViewportHistoryDemandPort(
      visible.port,
      coverage,
      { minimumBarsBefore: 20 },
    );

    expect(port.getCurrentDemand()).toEqual({
      visibleRange: { from: -5, to: 20 },
      coverage: { barsBefore: 12, barsAfter: 4 },
      minimumBarsBefore: 20,
      barsBeforeShortfall: 8,
    });
  });

  it('returns null for sufficient coverage, missing viewport, or missing series coverage', () => {
    const sufficientVisible = visibleRangePort({ from: 0, to: 10 });
    const sufficientCoverage: ChartSeriesLogicalRangeCoveragePort = {
      getCoverage: () => ({ barsBefore: 25, barsAfter: 3 }),
    };
    expect(
      createChartViewportHistoryDemandPort(
        sufficientVisible.port,
        sufficientCoverage,
        { minimumBarsBefore: 20 },
      ).getCurrentDemand(),
    ).toBeNull();

    const noViewport = visibleRangePort(null);
    expect(
      createChartViewportHistoryDemandPort(
        noViewport.port,
        sufficientCoverage,
        { minimumBarsBefore: 20 },
      ).getCurrentDemand(),
    ).toBeNull();

    const noCoverage: ChartSeriesLogicalRangeCoveragePort = {
      getCoverage: () => null,
    };
    expect(
      createChartViewportHistoryDemandPort(
        sufficientVisible.port,
        noCoverage,
        { minimumBarsBefore: 20 },
      ).getCurrentDemand(),
    ).toBeNull();
  });

  it('composes visible-range subscription without owning acquisition', () => {
    const visible = visibleRangePort({ from: 0, to: 10 });
    const coverage: ChartSeriesLogicalRangeCoveragePort = {
      getCoverage: ({ from }) => ({ barsBefore: from < 0 ? 2 : 30, barsAfter: 5 }),
    };
    const listener = vi.fn();
    const unsubscribe = createChartViewportHistoryDemandPort(
      visible.port,
      coverage,
      { minimumBarsBefore: 10 },
    ).subscribeDemandChange(listener);

    visible.emit({ from: -3, to: 8 });
    visible.emit({ from: 3, to: 14 });
    visible.emit(null);

    expect(listener).toHaveBeenNthCalledWith(1, {
      visibleRange: { from: -3, to: 8 },
      coverage: { barsBefore: 2, barsAfter: 5 },
      minimumBarsBefore: 10,
      barsBeforeShortfall: 8,
    });
    expect(listener).toHaveBeenNthCalledWith(2, null);
    expect(listener).toHaveBeenNthCalledWith(3, null);

    unsubscribe();
    expect(visible.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('rejects invalid injected policy instead of silently inventing a threshold', () => {
    const visible = visibleRangePort({ from: 0, to: 10 });
    const coverage: ChartSeriesLogicalRangeCoveragePort = {
      getCoverage: () => ({ barsBefore: 0, barsAfter: 0 }),
    };

    expect(() =>
      createChartViewportHistoryDemandPort(
        visible.port,
        coverage,
        { minimumBarsBefore: -1 },
      ),
    ).toThrow(RangeError);
  });
});
