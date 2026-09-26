import { describe, expect, it } from 'vitest';
import {
  defineChartIncrementalUpdate,
  defineIncrementalChartEnginePort,
  type IncrementalChartEnginePort,
} from '../src/features/chart';

describe('P17.7 chart incremental presentation contract', () => {
  it('preserves a projected price-line update without inventing state', () => {
    const update = defineChartIncrementalUpdate({
      kind: 'price-line',
      point: { time: 1788393600, value: 100.25 },
    });

    expect(update).toEqual({
      kind: 'price-line',
      point: { time: 1788393600, value: 100.25 },
    });
  });

  it('preserves a projected candle update without deriving execution truth', () => {
    const update = defineChartIncrementalUpdate({
      kind: 'candles',
      candle: {
        time: 1788393600,
        open: 100,
        high: 102,
        low: 99,
        close: 101,
      },
    });

    expect(update.kind).toBe('candles');
  });

  it('extends the existing engine session only with updateLatest', () => {
    const port: IncrementalChartEnginePort = {
      create: () => ({
        replaceSeries: () => undefined,
        updateLatest: () => undefined,
        destroy: () => undefined,
      }),
    };

    expect(defineIncrementalChartEnginePort(port)).toBe(port);
  });
});
