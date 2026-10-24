import { describe, expect, it, vi } from 'vitest';
import {
  applyLightweightChartsV5IncrementalUpdate,
  type LightweightChartsV5SeriesApi,
} from '../src/features/chart';

describe('P17.8 Lightweight Charts v5 incremental update mapping', () => {
  it('maps a projected line point to series.update', () => {
    const update = vi.fn();
    const series: LightweightChartsV5SeriesApi<{ time: number; value: number }> = {
      setData: vi.fn(),
      update,
    };

    applyLightweightChartsV5IncrementalUpdate(
      { kind: 'price-line', series },
      {
        kind: 'price-line',
        point: { time: 1788393600, value: 100.25 },
      },
    );

    expect(update).toHaveBeenCalledWith({
      time: 1788393600,
      value: 100.25,
    });
  });

  it('maps a projected candle to series.update', () => {
    const update = vi.fn();
    const series = {
      setData: vi.fn(),
      update,
    };

    applyLightweightChartsV5IncrementalUpdate(
      { kind: 'candles', series },
      {
        kind: 'candles',
        candle: {
          time: 1788393600,
          open: 100,
          high: 102,
          low: 99,
          close: 101,
        },
      },
    );

    expect(update).toHaveBeenCalledTimes(1);
  });

  it('rejects cross-kind updates instead of mutating the wrong series', () => {
    const update = vi.fn();
    const series = {
      setData: vi.fn(),
      update,
    };

    expect(() =>
      applyLightweightChartsV5IncrementalUpdate(
        { kind: 'price-line', series },
        {
          kind: 'candles',
          candle: {
            time: 1788393600,
            open: 100,
            high: 102,
            low: 99,
            close: 101,
          },
        },
      ),
    ).toThrow('chart-series-kind-mismatch');

    expect(update).not.toHaveBeenCalled();
  });
});
