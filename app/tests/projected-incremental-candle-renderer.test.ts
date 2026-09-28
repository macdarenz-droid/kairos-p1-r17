import { describe, expect, it, vi } from 'vitest';
import { parseDecimalString, type DecimalString } from '../src/domain/trades';
import {
  createProjectedIncrementalCandleRendererFactory,
  type IncrementalChartEnginePort,
} from '../src/features/chart';

function decimal(value: string): DecimalString {
  const parsed = parseDecimalString(value);
  if (!parsed.ok) throw new Error(`invalid decimal fixture: ${value}`);
  return parsed.value;
}

const candle = {
  openTime: '2026-09-13T00:01:00.000Z',
  closeTime: '2026-09-13T00:01:59.999Z',
  open: decimal('0.00001234'),
  high: decimal('0.00001300'),
  low: decimal('0.00001200'),
  close: decimal('0.00001280'),
};

describe('live candle production renderer binding', () => {
  it('projects and forwards one latest candle without replacing the active series', () => {
    const replaceSeries = vi.fn();
    const updateLatest = vi.fn();
    const engine: IncrementalChartEnginePort = {
      create: () => ({ replaceSeries, updateLatest, destroy: vi.fn() }),
    };
    const renderer = createProjectedIncrementalCandleRendererFactory(engine)
      .create(document.createElement('div'));

    renderer.render({
      market: { venue: 'binance-spot', instrument: 'SHIBUSDT', source: 'market-reference' },
      series: { kind: 'candles', candles: [candle] },
      journalExecutions: [],
    });
    renderer.updateLatestCandle({ ...candle, close: decimal('0.00001290') });

    expect(replaceSeries).toHaveBeenCalledTimes(1);
    expect(updateLatest).toHaveBeenCalledWith({
      kind: 'candles',
      candle: {
        time: 1789257660,
        open: 0.00001234,
        high: 0.000013,
        low: 0.000012,
        close: 0.0000129,
      },
    });
  });

  it('fails closed before a candle render, for a price-line render and after destroy', () => {
    const engine: IncrementalChartEnginePort = {
      create: () => ({ replaceSeries: vi.fn(), updateLatest: vi.fn(), destroy: vi.fn() }),
    };
    const renderer = createProjectedIncrementalCandleRendererFactory(engine)
      .create(document.createElement('div'));

    expect(() => renderer.updateLatestCandle(candle)).toThrow('chart-series-kind-mismatch');
    renderer.render({
      market: { venue: 'binance-spot', instrument: 'BTCUSDT', source: 'market-reference' },
      series: { kind: 'price-line', points: [] },
      journalExecutions: [],
    });
    expect(() => renderer.updateLatestCandle(candle)).toThrow('chart-series-kind-mismatch');
    renderer.destroy();
    expect(() => renderer.updateLatestCandle(candle)).toThrow('chart-renderer-destroyed');
  });
});
