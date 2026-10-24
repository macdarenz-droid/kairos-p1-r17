import { describe, expect, it, vi } from 'vitest';
import { parseDecimalString, type TradeId } from '../src/domain/trades';
import { projectAnalysisSavedTradeRiskRewardReference } from '../src/app/analysisSavedTradeRiskRewardReferenceProjection';
import { projectAnalysisSavedTradeRiskRewardRenderer } from '../src/app/analysisSavedTradeRiskRewardRendererProjection';
import {
  createAnalysisSavedTradeRiskRewardLightweightChartsV5SeriesBinding,
} from '../src/app/analysisSavedTradeRiskRewardLightweightChartsV5SeriesBinding';
import type { AnalysisSavedTradeChartReferenceProjection } from '../src/app/analysisSavedTradeChartReferenceProjection';

function decimal(value: string) {
  const result = parseDecimalString(value);
  if (!result.ok) throw new Error('invalid decimal fixture');
  return result.value;
}

function rendererReady() {
  const tradeId = 'trade-risk-reward-series-binding' as TradeId;
  const reference: AnalysisSavedTradeChartReferenceProjection = Object.freeze({
    kind: 'reference-ready' as const,
    tradeId,
    tradeSymbol: 'ETHUSDT',
    chartInstrument: Object.freeze({ venue: 'binance-spot', symbol: 'ETHUSDT' }),
    chartQuoteAsset: 'USDT',
    executionVenue: null,
    facts: Object.freeze({
      tradeId,
      symbol: 'ETHUSDT',
      side: 'long' as const,
      status: 'closed' as const,
      planned: Object.freeze({
        entry: decimal('2000.25'),
        stop: decimal('1950'),
        target: decimal('2100.75'),
      }),
      executedEntries: Object.freeze([]),
      executedExits: Object.freeze([]),
    }),
  });
  const logical = projectAnalysisSavedTradeRiskRewardReference(reference, {
    start: '2026-09-01T00:00:00Z', end: '2026-09-01T04:00:00Z',
  });
  const renderer = projectAnalysisSavedTradeRiskRewardRenderer(logical);
  if (renderer.kind !== 'renderer-ready') throw new Error('expected renderer-ready');
  return renderer;
}

function styleSource() {
  return {
    lineWidth: 2,
    zoneOpacity: 0.2,
    resolveToken: vi.fn((token: string) => `resolved:${token}`),
  };
}

function seriesHarness() {
  const attached: unknown[] = [];
  const calls: string[] = [];
  return {
    attached,
    calls,
    series: {
      attachPrimitive(primitive: unknown) {
        calls.push('attach');
        attached.push(primitive);
      },
      detachPrimitive(primitive: unknown) {
        calls.push('detach');
        expect(attached.at(-1)).toBe(primitive);
      },
    },
  };
}

describe('Analysis saved-trade Risk/Reward Lightweight Charts v5 series binding', () => {
  it('attaches exactly one Gate452 primitive to the caller-owned series', () => {
    const harness = seriesHarness();
    const source = rendererReady();
    const binding = createAnalysisSavedTradeRiskRewardLightweightChartsV5SeriesBinding(harness.series);
    const result = binding.present(source, styleSource());

    expect(result.kind).toBe('bound');
    expect(harness.calls).toEqual(['attach']);
    if (result.kind !== 'bound') throw new Error('expected bound');
    expect(result.rendererProjection).toBe(source);
    expect(result.primitiveProjection.rendererProjection).toBe(source);
    expect(harness.attached[0]).toBe(result.primitiveProjection.primitive);
  });

  it('detaches the previous primitive before replacement', () => {
    const harness = seriesHarness();
    const binding = createAnalysisSavedTradeRiskRewardLightweightChartsV5SeriesBinding(harness.series);
    const first = binding.present(rendererReady(), styleSource());
    const second = binding.present(rendererReady(), styleSource());

    expect(first.kind).toBe('bound');
    expect(second.kind).toBe('bound');
    expect(harness.calls).toEqual(['attach', 'detach', 'attach']);
    if (first.kind === 'bound' && second.kind === 'bound') {
      expect(second.primitiveProjection.primitive).not.toBe(first.primitiveProjection.primitive);
    }
  });

  it('propagates exact Gate449 unavailable evidence and clears the active primitive', () => {
    const harness = seriesHarness();
    const binding = createAnalysisSavedTradeRiskRewardLightweightChartsV5SeriesBinding(harness.series);
    binding.present(rendererReady(), styleSource());
    const unavailable = Object.freeze({ kind: 'unavailable' as const, reason: 'planned-stop-missing' as const });

    expect(binding.present(unavailable, styleSource())).toBe(unavailable);
    expect(binding.presentation()).toBe(unavailable);
    expect(harness.calls).toEqual(['attach', 'detach']);
  });

  it('rejects mismatched primitive evidence before provider attachment', () => {
    const harness = seriesHarness();
    const source = rendererReady();
    const other = rendererReady();
    const binding = createAnalysisSavedTradeRiskRewardLightweightChartsV5SeriesBinding(
      harness.series,
      () => Object.freeze({
        kind: 'primitive-ready' as const,
        rendererProjection: other,
        primitive: Object.freeze({
          attached() {}, detached() {}, updateAllViews() {},
          paneViews: () => Object.freeze([]), currentCanvasProjection: () => null,
        }),
      }),
    );

    expect(() => binding.present(source, styleSource())).toThrow(
      'analysis-saved-trade-risk-reward-primitive-evidence-invalid',
    );
    expect(harness.calls).toEqual([]);
    expect(binding.presentation()).toBeNull();
  });

  it('closes idempotently and detaches only its own active primitive once', () => {
    const harness = seriesHarness();
    const binding = createAnalysisSavedTradeRiskRewardLightweightChartsV5SeriesBinding(harness.series);
    binding.present(rendererReady(), styleSource());
    binding.close();
    binding.close();

    expect(harness.calls).toEqual(['attach', 'detach']);
    expect(binding.presentation()).toBeNull();
    expect(() => binding.present(rendererReady(), styleSource())).toThrow(
      'analysis-saved-trade-risk-reward-series-binding-closed',
    );
  });

  it('does not resolve styles or access scales during binding', () => {
    const harness = seriesHarness();
    const style = styleSource();
    const binding = createAnalysisSavedTradeRiskRewardLightweightChartsV5SeriesBinding(harness.series);
    const result = binding.present(rendererReady(), style);

    expect(result.kind).toBe('bound');
    expect(style.resolveToken).not.toHaveBeenCalled();
    expect(result.kind === 'bound' && result.primitiveProjection.primitive.currentCanvasProjection()).toBeNull();
  });

  it('freezes the binding and complete bound presentation', () => {
    const harness = seriesHarness();
    const binding = createAnalysisSavedTradeRiskRewardLightweightChartsV5SeriesBinding(harness.series);
    const result = binding.present(rendererReady(), styleSource());
    expect(Object.isFrozen(binding)).toBe(true);
    expect(Object.isFrozen(result)).toBe(true);
  });
});
