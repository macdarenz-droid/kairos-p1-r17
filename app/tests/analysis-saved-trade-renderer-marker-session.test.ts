import { describe, expect, it, vi } from 'vitest';
import type { ChartTheme } from '../src/design-system/themes/chartThemeAdapter';
import type {
  LightweightChartsV5ProductionCandlestickSeriesLifecycle,
  PresentedChartRenderer,
} from '../src/features/chart/lightweightChartsV5ProductionRenderer';
import type { LightweightChartsV5SeriesApi } from '../src/features/chart/lightweightChartsV5ModuleAdapter';
import type { AnalysisSavedTradeExecutionMarkerProjection } from '../src/app/analysisSavedTradeExecutionMarkerProjection';
import type {
  AnalysisSavedTradeLightweightChartsV5MarkerBinding,
  AnalysisSavedTradeMarkerSeries,
} from '../src/app/analysisSavedTradeLightweightChartsV5MarkerBinding';
import { createAnalysisSavedTradeRendererMarkerSession } from '../src/app/analysisSavedTradeRendererMarkerSession';

const theme = { drawingPrimary: '#111111', drawingSecondary: '#eeeeee' } as ChartTheme;
const ready: AnalysisSavedTradeExecutionMarkerProjection = {
  kind: 'markers-ready',
  historyObservedAt: '2026-09-14T00:03:00.000Z',
  historyInterval: '1m',
  markers: [],
  unplacedExecutions: [],
};

function fakeRenderer(): PresentedChartRenderer {
  return {
    render: vi.fn(), updateLatestCandle: vi.fn(), setTheme: vi.fn(), resetView: vi.fn(),
    showRecent: vi.fn(), zoom: vi.fn(), pan: vi.fn(), destroy: vi.fn(),
  };
}

function harness() {
  const holder: { lifecycle?: LightweightChartsV5ProductionCandlestickSeriesLifecycle } = {};
  const bindings: Array<{
    readonly series: AnalysisSavedTradeMarkerSeries;
    readonly present: ReturnType<typeof vi.fn>;
    readonly close: ReturnType<typeof vi.fn>;
  }> = [];
  const session = createAnalysisSavedTradeRendererMarkerSession({
    createRendererFactory(next) {
      holder.lifecycle = next;
      return { create: () => fakeRenderer() };
    },
    createMarkerBinding(series) {
      const present = vi.fn<AnalysisSavedTradeLightweightChartsV5MarkerBinding['present']>(() => ({
        kind: 'presented', markerCount: 0, unplacedExecutions: [],
      }));
      const close = vi.fn();
      bindings.push({ series, present, close });
      return { present, close };
    },
  });
  if (holder.lifecycle === undefined) throw new Error('test-lifecycle-unavailable');
  return { session, lifecycle: holder.lifecycle, bindings };
}

describe('Analysis saved-trade renderer marker session', () => {
  it('retains exact marker evidence until the production candle series is attached', () => {
    const { session, lifecycle, bindings } = harness();
    expect(session.present(ready, theme)).toEqual({ kind: 'pending-series' });

    const series = {} as LightweightChartsV5SeriesApi<unknown>;
    lifecycle.attach(series);

    expect(bindings).toHaveLength(1);
    expect(bindings[0].series).toBe(series);
    expect(bindings[0].present).toHaveBeenCalledWith(ready, theme);
    expect(session.presentation()).toEqual({ kind: 'presented', markerCount: 0, unplacedExecutions: [] });
  });

  it('forwards later exact projection and theme replacement to the same active binding', () => {
    const { session, lifecycle, bindings } = harness();
    const series = {} as LightweightChartsV5SeriesApi<unknown>;
    lifecycle.attach(series);

    expect(session.present(ready, theme)).toEqual({ kind: 'presented', markerCount: 0, unplacedExecutions: [] });
    expect(bindings).toHaveLength(1);
    expect(bindings[0].present).toHaveBeenCalledWith(ready, theme);
  });

  it('closes the old binding and reapplies the latest exact evidence after renderer series replacement', () => {
    const { session, lifecycle, bindings } = harness();
    const first = {} as LightweightChartsV5SeriesApi<unknown>;
    const second = {} as LightweightChartsV5SeriesApi<unknown>;
    session.present(ready, theme);
    lifecycle.attach(first);
    lifecycle.detach(first);
    expect(session.presentation()).toEqual({ kind: 'pending-series' });
    lifecycle.attach(second);

    expect(bindings).toHaveLength(2);
    expect(bindings[0].close).toHaveBeenCalledOnce();
    expect(bindings[1].present).toHaveBeenCalledWith(ready, theme);
  });

  it('fails closed instead of silently accepting overlapping or mismatched series lifecycles', () => {
    const { lifecycle } = harness();
    const first = {} as LightweightChartsV5SeriesApi<unknown>;
    const second = {} as LightweightChartsV5SeriesApi<unknown>;
    lifecycle.attach(first);
    expect(() => lifecycle.attach(second)).toThrow('analysis-saved-trade-renderer-marker-series-already-active');
    expect(() => lifecycle.detach(second)).toThrow('analysis-saved-trade-renderer-marker-series-mismatch');
  });

  it('cleans up a binding when retained evidence fails during series activation', () => {
    const holder: { lifecycle?: LightweightChartsV5ProductionCandlestickSeriesLifecycle } = {};
    const close = vi.fn();
    const session = createAnalysisSavedTradeRendererMarkerSession({
      createRendererFactory(next) { holder.lifecycle = next; return { create: () => fakeRenderer() }; },
      createMarkerBinding: () => ({ present() { throw new Error('marker-presentation-failed'); }, close }),
    });
    session.present(ready, theme);
    const lifecycle = holder.lifecycle;
    if (lifecycle === undefined) throw new Error('test-lifecycle-unavailable');
    expect(() => lifecycle.attach({} as LightweightChartsV5SeriesApi<unknown>)).toThrow('marker-presentation-failed');
    expect(close).toHaveBeenCalledOnce();
  });

  it('closes once, clears retained evidence and rejects later presentation or attachment', () => {
    const { session, lifecycle, bindings } = harness();
    const series = {} as LightweightChartsV5SeriesApi<unknown>;
    lifecycle.attach(series);
    session.present(ready, theme);
    session.close();
    session.close();

    expect(bindings[0].close).toHaveBeenCalledOnce();
    expect(session.presentation()).toBeNull();
    expect(() => session.present(ready, theme)).toThrow('analysis-saved-trade-renderer-marker-session-closed');
    expect(() => lifecycle.attach(series)).toThrow('analysis-saved-trade-renderer-marker-session-closed');
    expect(() => lifecycle.detach(series)).not.toThrow();
  });
});
