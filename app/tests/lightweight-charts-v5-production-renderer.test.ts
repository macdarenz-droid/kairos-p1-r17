import { describe, expect, it, vi } from 'vitest';
import { createLightweightChartsV5ProductionRendererFactory } from '../src/features/chart/lightweightChartsV5ProductionRenderer';

describe('P17.10 Lightweight Charts v5 production renderer composition', () => {
  it('composes the real package into the existing renderer factory without creating presentation resources eagerly', () => {
    const factory = createLightweightChartsV5ProductionRendererFactory();
    expect(factory).toBeDefined();
    expect(typeof factory.create).toBe('function');
  });

  it('exposes the released latest-candle presentation capability', () => {
    const renderer = createLightweightChartsV5ProductionRendererFactory()
      .create(document.createElement('div'));

    expect(typeof renderer.updateLatestCandle).toBe('function');
    renderer.destroy();
  });

  it('reports the exact active candlestick series lifecycle without exposing it on the renderer', () => {
    const lifecycle = { attach: vi.fn(), detach: vi.fn() };
    const renderer = createLightweightChartsV5ProductionRendererFactory(lifecycle)
      .create(document.createElement('div'));
    const model = {
      market: { venue: 'binance-spot', instrument: 'BTCUSDT', source: 'market-reference' as const },
      series: {
        kind: 'candles' as const,
        candles: [{
          openTime: '2026-09-14T00:00:00.000Z', closeTime: '2026-09-14T00:00:59.999Z',
          open: '100' as never, high: '110' as never, low: '90' as never, close: '105' as never,
        }],
      },
      journalExecutions: [],
    };

    renderer.render(model);
    const first = lifecycle.attach.mock.calls[0][0];
    renderer.render(model);
    const second = lifecycle.attach.mock.calls[1][0];

    expect(lifecycle.attach).toHaveBeenCalledTimes(2);
    expect(second).not.toBe(first);
    expect(lifecycle.detach).toHaveBeenNthCalledWith(1, first);
    expect('series' in renderer).toBe(false);

    renderer.destroy();
    expect(lifecycle.detach).toHaveBeenNthCalledWith(2, second);
  });
});
