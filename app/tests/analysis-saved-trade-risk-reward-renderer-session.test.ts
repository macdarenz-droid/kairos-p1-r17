import { describe, expect, it, vi } from 'vitest';
import type {
  LightweightChartsV5ProductionCandlestickSeriesLifecycle,
  PresentedChartRenderer,
} from '../src/features/chart/lightweightChartsV5ProductionRenderer';
import type { LightweightChartsV5SeriesApi } from '../src/features/chart/lightweightChartsV5ModuleAdapter';
import type { AnalysisSavedTradeRiskRewardCanvasStyleSource } from '../src/app/analysisSavedTradeRiskRewardCanvasPaneRenderer';
import type {
  AnalysisSavedTradeRiskRewardLightweightChartsV5SeriesBinding,
  AnalysisSavedTradeRiskRewardPrimitiveSeries,
} from '../src/app/analysisSavedTradeRiskRewardLightweightChartsV5SeriesBinding';
import type { AnalysisSavedTradeRiskRewardRendererProjection } from '../src/app/analysisSavedTradeRiskRewardRendererProjection';
import { createAnalysisSavedTradeRiskRewardRendererSession } from '../src/app/analysisSavedTradeRiskRewardRendererSession';

const ready = Object.freeze({ kind: 'renderer-ready' as const }) as AnalysisSavedTradeRiskRewardRendererProjection;
const unavailable = Object.freeze({
  kind: 'unavailable' as const,
  reason: 'planned-stop-missing' as const,
}) satisfies AnalysisSavedTradeRiskRewardRendererProjection;
const styleSource = Object.freeze({
  lineWidth: 2,
  zoneOpacity: 0.2,
  resolveToken: vi.fn((token: string) => token),
}) satisfies AnalysisSavedTradeRiskRewardCanvasStyleSource;

function fakeRenderer(): PresentedChartRenderer {
  return {
    render: vi.fn(), updateLatestCandle: vi.fn(), setTheme: vi.fn(), resetView: vi.fn(),
    showRecent: vi.fn(), zoom: vi.fn(), pan: vi.fn(), destroy: vi.fn(),
  };
}

function harness() {
  const holder: { lifecycle?: LightweightChartsV5ProductionCandlestickSeriesLifecycle } = {};
  const bindings: Array<{
    readonly series: AnalysisSavedTradeRiskRewardPrimitiveSeries;
    readonly present: ReturnType<typeof vi.fn>;
    readonly close: ReturnType<typeof vi.fn>;
  }> = [];
  const session = createAnalysisSavedTradeRiskRewardRendererSession({
    createRendererFactory(next) {
      holder.lifecycle = next;
      return { create: () => fakeRenderer() };
    },
    createRiskRewardBinding(series) {
      const present = vi.fn<AnalysisSavedTradeRiskRewardLightweightChartsV5SeriesBinding['present']>(
        (projection) => projection.kind === 'unavailable'
          ? projection
          : ({ kind: 'bound', rendererProjection: projection, primitiveProjection: {} } as never),
      );
      const close = vi.fn();
      bindings.push({ series, present, close });
      return { present, presentation: vi.fn(() => null), close };
    },
  });
  if (holder.lifecycle === undefined) throw new Error('test-lifecycle-unavailable');
  return { session, lifecycle: holder.lifecycle, bindings };
}

describe('Analysis saved-trade Risk/Reward renderer session', () => {
  it('retains exact renderer and style evidence until the production candle series is attached', () => {
    const { session, lifecycle, bindings } = harness();
    expect(session.present(ready, styleSource)).toEqual({ kind: 'pending-series' });

    const series = {} as LightweightChartsV5SeriesApi<unknown>;
    lifecycle.attach(series);

    expect(bindings).toHaveLength(1);
    expect(bindings[0].series).toBe(series);
    expect(bindings[0].present).toHaveBeenCalledWith(ready, styleSource);
    expect(session.presentation()?.kind).toBe('bound');
  });

  it('propagates exact unavailable evidence before a series exists', () => {
    const { session, lifecycle, bindings } = harness();
    expect(session.present(unavailable, styleSource)).toBe(unavailable);
    expect(session.presentation()).toBe(unavailable);

    lifecycle.attach({} as LightweightChartsV5SeriesApi<unknown>);
    expect(bindings[0].present).toHaveBeenCalledWith(unavailable, styleSource);
    expect(session.presentation()).toBe(unavailable);
  });

  it('forwards later exact evidence to the same active binding', () => {
    const { session, lifecycle, bindings } = harness();
    lifecycle.attach({} as LightweightChartsV5SeriesApi<unknown>);
    session.present(ready, styleSource);
    session.present(unavailable, styleSource);

    expect(bindings).toHaveLength(1);
    expect(bindings[0].present).toHaveBeenNthCalledWith(1, ready, styleSource);
    expect(bindings[0].present).toHaveBeenNthCalledWith(2, unavailable, styleSource);
  });

  it('closes the old binding and reapplies retained evidence after renderer series replacement', () => {
    const { session, lifecycle, bindings } = harness();
    const first = {} as LightweightChartsV5SeriesApi<unknown>;
    const second = {} as LightweightChartsV5SeriesApi<unknown>;
    session.present(ready, styleSource);
    lifecycle.attach(first);
    lifecycle.detach(first);
    expect(session.presentation()).toEqual({ kind: 'pending-series' });
    lifecycle.attach(second);

    expect(bindings).toHaveLength(2);
    expect(bindings[0].close).toHaveBeenCalledOnce();
    expect(bindings[1].present).toHaveBeenCalledWith(ready, styleSource);
  });

  it('fails closed for overlapping or mismatched series lifecycle evidence', () => {
    const { lifecycle } = harness();
    const first = {} as LightweightChartsV5SeriesApi<unknown>;
    const second = {} as LightweightChartsV5SeriesApi<unknown>;
    lifecycle.attach(first);
    expect(() => lifecycle.attach(second)).toThrow(
      'analysis-saved-trade-risk-reward-renderer-series-already-active',
    );
    expect(() => lifecycle.detach(second)).toThrow(
      'analysis-saved-trade-risk-reward-renderer-series-mismatch',
    );
  });

  it('closes a new binding when retained evidence fails during series activation', () => {
    const holder: { lifecycle?: LightweightChartsV5ProductionCandlestickSeriesLifecycle } = {};
    const close = vi.fn();
    const session = createAnalysisSavedTradeRiskRewardRendererSession({
      createRendererFactory(next) { holder.lifecycle = next; return { create: () => fakeRenderer() }; },
      createRiskRewardBinding: () => ({
        present() { throw new Error('risk-reward-presentation-failed'); },
        presentation: () => null,
        close,
      }),
    });
    session.present(ready, styleSource);
    if (holder.lifecycle === undefined) throw new Error('test-lifecycle-unavailable');
    expect(() => holder.lifecycle?.attach({} as LightweightChartsV5SeriesApi<unknown>)).toThrow(
      'risk-reward-presentation-failed',
    );
    expect(close).toHaveBeenCalledOnce();
    expect(session.presentation()?.kind).toBe('pending-series');
  });

  it('closes idempotently, clears retained evidence and freezes the session', () => {
    const { session, lifecycle, bindings } = harness();
    const series = {} as LightweightChartsV5SeriesApi<unknown>;
    lifecycle.attach(series);
    session.present(ready, styleSource);
    session.close();
    session.close();

    expect(Object.isFrozen(session)).toBe(true);
    expect(bindings[0].close).toHaveBeenCalledOnce();
    expect(session.presentation()).toBeNull();
    expect(() => session.present(ready, styleSource)).toThrow(
      'analysis-saved-trade-risk-reward-renderer-session-closed',
    );
    expect(() => lifecycle.attach(series)).toThrow(
      'analysis-saved-trade-risk-reward-renderer-session-closed',
    );
    expect(() => lifecycle.detach(series)).not.toThrow();
  });
});
