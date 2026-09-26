import { describe, expect, it, vi } from 'vitest';
import { composeDrawingBindingLifecycles, createAnalysisTimeAssistedWindowSession, padTimeAssistedWindow } from '../src/app/analysisTimeAssistedWindowSession';
import { createLightweightChartsV5DriverBinding, type LightweightChartsV5Module } from '../src/features/chart';

function harness(withRange = true) {
  const setVisibleRange = vi.fn(); let visible: { from: number; to: number } | null = null;
  const timeScale = { getVisibleLogicalRange: () => null, subscribeVisibleLogicalRangeChange: vi.fn(), unsubscribeVisibleLogicalRangeChange: vi.fn(), ...(withRange ? { setVisibleRange: (r: { from: number; to: number }) => { setVisibleRange(r); visible = { from: r.from - 60, to: r.to + 60 }; }, getVisibleRange: () => visible } : {}) };
  const series = { setData: vi.fn(), update: vi.fn(), attachPrimitive: vi.fn(), detachPrimitive: vi.fn() };
  const chart = { timeScale: () => timeScale, subscribeClick: vi.fn(), unsubscribeClick: vi.fn(), subscribeCrosshairMove: vi.fn(), unsubscribeCrosshairMove: vi.fn(), addSeries: () => series, removeSeries: vi.fn(), remove: vi.fn() };
  const module: LightweightChartsV5Module = { createChart: () => chart, LineSeries: { __kairosSeriesData: undefined }, CandlestickSeries: { __kairosSeriesData: undefined } };
  const binding = createLightweightChartsV5DriverBinding(module);
  const handle = binding.driver.createChart(document.createElement('div')).addCandlestickSeries();
  return { binding, handle, setVisibleRange };
}
const t = (iso: string) => Date.parse(iso);

describe('P22.5 time-assisted window navigation', () => {
  it('pads the interval by a fraction with a floor', () => {
    expect(padTimeAssistedWindow({ fromMs: t('2026-09-10T02:13:27.000Z'), toMs: t('2026-09-10T04:30:05.000Z') })).toEqual({ fromMs: t('2026-09-10T02:13:27.000Z') - 1_229_700, toMs: t('2026-09-10T04:30:05.000Z') + 1_229_700 });
    expect(padTimeAssistedWindow({ fromMs: 1_000_000, toMs: 1_060_000 })).toEqual({ fromMs: 1_000_000 - 300_000, toMs: 1_060_000 + 300_000 });
  });

  it('asks the bound chart for the padded range through the seam, reports the applied range, and fails closed before a chart or without range support', () => {
    const session = createAnalysisTimeAssistedWindowSession();
    const range = { fromMs: t('2026-09-10T02:13:27.000Z'), toMs: t('2026-09-10T04:30:05.000Z') };
    expect(session.show(range)).toEqual({ kind: 'pending-chart' });
    expect(session.show({ fromMs: 5, toMs: 4 })).toEqual({ kind: 'invalid-range' });
    const h = harness();
    const other = { attach: vi.fn(), detach: vi.fn() };
    const fanned = composeDrawingBindingLifecycles(session.lifecycle, other);
    fanned.attach(h.binding, h.handle);
    expect(other.attach).toHaveBeenCalledWith(h.binding, h.handle);
    const padded = padTimeAssistedWindow(range);
    const shown = session.show(range);
    expect(h.setVisibleRange).toHaveBeenCalledWith({ from: Math.floor(padded.fromMs / 1000), to: Math.ceil(padded.toMs / 1000) });
    expect(shown).toEqual({ kind: 'shown', requested: padded, visible: null });
    expect(session.visibleRange()).toEqual({ fromMs: (Math.floor(padded.fromMs / 1000) - 60) * 1000, toMs: (Math.ceil(padded.toMs / 1000) + 60) * 1000 });
    fanned.detach(h.handle);
    expect(other.detach).toHaveBeenCalledWith(h.handle);
    expect(session.show(range)).toEqual({ kind: 'pending-chart' });
    expect(session.visibleRange()).toBeNull();
    const plain = harness(false);
    session.lifecycle.attach(plain.binding, plain.handle);
    expect(session.show(range)).toEqual({ kind: 'unsupported' });
    expect(session.visibleRange()).toBeNull();
    session.destroy();
    expect(() => session.show(range)).toThrow('analysis-time-assisted-window-session-destroyed');
    expect(() => session.lifecycle.attach(plain.binding, plain.handle)).toThrow('analysis-time-assisted-window-session-destroyed');
  });
});
