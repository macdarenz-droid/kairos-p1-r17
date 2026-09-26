import { describe, expect, it, vi } from 'vitest';
import { createLightweightChartsV5ProductionRendererFactory } from '../src/features/chart/lightweightChartsV5ProductionRenderer';

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

describe('Production renderer drawing-binding seam', () => {
  it('reports the P18 driver binding and the exact candlestick handle after the series exists, and resolves the same vendor series the series lifecycle saw', () => {
    const seriesLifecycle = { attach: vi.fn(), detach: vi.fn() };
    const drawingLifecycle = { attach: vi.fn(), detach: vi.fn() };
    const renderer = createLightweightChartsV5ProductionRendererFactory(seriesLifecycle, drawingLifecycle).create(document.createElement('div'));
    expect(drawingLifecycle.attach).not.toHaveBeenCalled();
    renderer.render(model);
    expect(drawingLifecycle.attach).toHaveBeenCalledTimes(1);
    const [binding, handle] = drawingLifecycle.attach.mock.calls[0];
    expect(typeof handle.setCandleData).toBe('function');
    expect(binding.resolveSeries(handle)).toBe(seriesLifecycle.attach.mock.calls[0][0]);
    expect(typeof binding.resolveChart(handle).subscribeClick).toBe('function');
    expect(Object.keys(renderer)).not.toContain('binding');
    renderer.destroy();
    expect(drawingLifecycle.detach).toHaveBeenCalledTimes(1);
    expect(drawingLifecycle.detach).toHaveBeenLastCalledWith(handle);
    expect(() => binding.resolveSeries(handle)).toThrow('chart-series-handle-unknown');
  });

  it('detaches the old handle before the replacement candlestick series attaches, and forwards the vendor click and crosshair subscriptions', () => {
    const drawingLifecycle = { attach: vi.fn(), detach: vi.fn() };
    const renderer = createLightweightChartsV5ProductionRendererFactory(undefined, drawingLifecycle).create(document.createElement('div'));
    renderer.render(model);
    const [binding, first] = drawingLifecycle.attach.mock.calls[0];
    const chart = binding.resolveChart(first);
    for (const name of ['subscribeClick', 'unsubscribeClick', 'subscribeCrosshairMove', 'unsubscribeCrosshairMove', 'timeScale']) expect(typeof chart[name], name).toBe('function');
    const handler = vi.fn();
    expect(() => { chart.subscribeClick(handler); chart.unsubscribeClick(handler); chart.subscribeCrosshairMove(handler); chart.unsubscribeCrosshairMove(handler); }).not.toThrow();
    renderer.render(model);
    expect(drawingLifecycle.detach).toHaveBeenCalledTimes(1);
    expect(drawingLifecycle.detach).toHaveBeenLastCalledWith(first);
    expect(drawingLifecycle.attach).toHaveBeenCalledTimes(2);
    expect(drawingLifecycle.attach.mock.calls[1][1]).not.toBe(first);
    expect(drawingLifecycle.detach.mock.invocationCallOrder[0]).toBeLessThan(drawingLifecycle.attach.mock.invocationCallOrder[1]);
    renderer.destroy();
    expect(drawingLifecycle.detach).toHaveBeenCalledTimes(2);
  });

  it('keeps the released behaviour byte-for-byte when no drawing lifecycle is supplied', () => {
    const seriesLifecycle = { attach: vi.fn(), detach: vi.fn() };
    const renderer = createLightweightChartsV5ProductionRendererFactory(seriesLifecycle).create(document.createElement('div'));
    renderer.render(model);
    expect(seriesLifecycle.attach).toHaveBeenCalledTimes(1);
    renderer.destroy();
    expect(seriesLifecycle.detach).toHaveBeenCalledTimes(1);
  });
});
