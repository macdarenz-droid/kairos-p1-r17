import { describe, expect, it, vi } from 'vitest';
import { parseDecimalString, type DecimalString } from '../src/domain/trades';
import {
  createProjectedChartRendererFactory,
  type ChartEnginePort,
} from '../src/features/chart';

function decimal(value: string): DecimalString {
  const parsed = parseDecimalString(value);
  if (!parsed.ok) throw new Error(`invalid decimal fixture: ${value}`);
  return parsed.value;
}

describe('P17.4 projected chart renderer composition', () => {
  it('projects authoritative input before delegating to the injected engine', () => {
    const replaceSeries = vi.fn();
    const destroy = vi.fn();
    const engine: ChartEnginePort = {
      create: vi.fn(() => ({ replaceSeries, destroy })),
    };

    const renderer = createProjectedChartRendererFactory(engine)
      .create(document.createElement('div'));

    renderer.render({
      market: {
        venue: 'binance-spot',
        instrument: 'BTCUSDT',
        source: 'market-reference',
      },
      series: {
        kind: 'price-line',
        points: [{
          timestamp: '2026-09-03T00:00:00.000Z',
          price: decimal('100.25'),
        }],
      },
      journalExecutions: [{
        executionId: 'execution-1',
        timestamp: '2026-09-03T00:00:01.000Z',
        price: decimal('99.5'),
        source: 'journal-execution',
      }],
    });

    expect(replaceSeries).toHaveBeenCalledWith({
      kind: 'price-line',
      data: [{ time: 1788393600, value: 100.25 }],
    });
  });

  it('destroys the engine session idempotently and blocks future render', () => {
    const replaceSeries = vi.fn();
    const destroy = vi.fn();
    const engine: ChartEnginePort = {
      create: () => ({ replaceSeries, destroy }),
    };

    const renderer = createProjectedChartRendererFactory(engine)
      .create(document.createElement('div'));

    renderer.destroy();
    renderer.destroy();

    expect(destroy).toHaveBeenCalledTimes(1);

    expect(() => renderer.render({
      market: {
        venue: 'binance-spot',
        instrument: 'BTCUSDT',
        source: 'market-reference',
      },
      series: { kind: 'price-line', points: [] },
      journalExecutions: [],
    })).toThrow('chart-renderer-destroyed');
  });
});
