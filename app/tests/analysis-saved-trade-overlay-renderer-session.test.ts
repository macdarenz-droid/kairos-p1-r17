import { expect, it, vi } from 'vitest';
import type { ChartTheme } from '../src/design-system/themes/chartThemeAdapter';
import { createAnalysisSavedTradeOverlayRendererSession } from '../src/app/analysisSavedTradeOverlayRendererSession';
import type { AnalysisSavedTradeExecutionMarkerProjection } from '../src/app/analysisSavedTradeExecutionMarkerProjection';
import type { AnalysisSavedTradeRiskRewardRendererProjection } from '../src/app/analysisSavedTradeRiskRewardRendererProjection';

const markerProjection = Object.freeze({ kind: 'markers-ready' }) as unknown as AnalysisSavedTradeExecutionMarkerProjection;
const riskRewardProjection = Object.freeze({ kind: 'renderer-ready' }) as unknown as AnalysisSavedTradeRiskRewardRendererProjection;
const unavailableRiskReward = Object.freeze({ kind: 'unavailable', reason: 'planned-stop-missing' }) as AnalysisSavedTradeRiskRewardRendererProjection;
const theme = Object.freeze({ drawingPrimary: '#1', drawingSecondary: '#2' }) as ChartTheme;
const styleSource = Object.freeze({ lineWidth: 2, zoneOpacity: 0.2, resolveToken: vi.fn(() => '#fff') });

function harness() {
  let lifecycle: { attach(series: unknown): void; detach(series: unknown): void } | null = null;
  const rendererFactory = { create: vi.fn() };
  const markerPresentation = Object.freeze({ kind: 'presented' as const, markerCount: 2, unplacedExecutions: Object.freeze([]) });
  const riskRewardPresentation = Object.freeze({ kind: 'bound' }) as never;
  const markerBinding = { present: vi.fn(() => markerPresentation), close: vi.fn() };
  const riskRewardBinding = { present: vi.fn(() => riskRewardPresentation), presentation: vi.fn(), close: vi.fn() };
  const createMarkerBinding = vi.fn(() => markerBinding);
  const createRiskRewardBinding = vi.fn(() => riskRewardBinding);
  const session = createAnalysisSavedTradeOverlayRendererSession({
    createRendererFactory(next) { lifecycle = next as never; return rendererFactory as never; },
    createMarkerBinding: createMarkerBinding as never,
    createRiskRewardBinding: createRiskRewardBinding as never,
  });
  return { session, lifecycle: () => lifecycle!, rendererFactory, markerBinding, riskRewardBinding, createMarkerBinding, createRiskRewardBinding };
}

it('exposes one exact renderer factory for both released overlay bindings', () => {
  const h = harness();
  expect(h.session.rendererFactory).toBe(h.rendererFactory);
  expect(h.createMarkerBinding).not.toHaveBeenCalled();
  expect(h.createRiskRewardBinding).not.toHaveBeenCalled();
});

it('attaches markers and Risk/Reward to the same exact P17 candlestick series', () => {
  const h = harness();
  h.session.presentMarkers(markerProjection, theme);
  h.session.presentRiskReward(riskRewardProjection, styleSource);
  const series = { marker: 'same-series' };
  h.lifecycle().attach(series);
  expect(h.createMarkerBinding).toHaveBeenCalledWith(series);
  expect(h.createRiskRewardBinding).toHaveBeenCalledWith(series);
  expect(h.markerBinding.present).toHaveBeenCalledWith(markerProjection, theme);
  expect(h.riskRewardBinding.present).toHaveBeenCalledWith(riskRewardProjection, styleSource);
  expect(h.session.presentation()).toEqual({
    markers: expect.objectContaining({ kind: 'presented' }),
    riskReward: expect.objectContaining({ kind: 'bound' }),
  });
});

it('retains each latest exact projection independently across series replacement', () => {
  const h = harness();
  const first = {};
  h.lifecycle().attach(first);
  h.session.presentMarkers(markerProjection, theme);
  h.session.presentRiskReward(riskRewardProjection, styleSource);
  h.lifecycle().detach(first);
  expect(h.session.presentation()).toEqual({
    markers: { kind: 'pending-series' },
    riskReward: { kind: 'pending-series' },
  });
  const second = {};
  h.lifecycle().attach(second);
  expect(h.createMarkerBinding).toHaveBeenLastCalledWith(second);
  expect(h.createRiskRewardBinding).toHaveBeenLastCalledWith(second);
  expect(h.markerBinding.present).toHaveBeenLastCalledWith(markerProjection, theme);
  expect(h.riskRewardBinding.present).toHaveBeenLastCalledWith(riskRewardProjection, styleSource);
});

it('propagates exact unavailable Risk/Reward evidence while no series exists', () => {
  const h = harness();
  expect(h.session.presentRiskReward(unavailableRiskReward, styleSource)).toBe(unavailableRiskReward);
  expect(h.session.presentation().riskReward).toBe(unavailableRiskReward);
  expect(h.createRiskRewardBinding).not.toHaveBeenCalled();
});

it('closes both bindings in reverse attachment order and rejects mismatched lifecycle evidence', () => {
  const h = harness();
  const series = {};
  h.lifecycle().attach(series);
  expect(() => h.lifecycle().attach({})).toThrow('series-already-active');
  expect(() => h.lifecycle().detach({})).toThrow('series-mismatch');
  h.session.close();
  h.session.close();
  expect(h.riskRewardBinding.close).toHaveBeenCalledTimes(1);
  expect(h.markerBinding.close).toHaveBeenCalledTimes(1);
  expect(h.session.presentation()).toEqual({ markers: null, riskReward: null });
  expect(() => h.session.presentMarkers(markerProjection, theme)).toThrow('session-closed');
});

it('rolls back marker attachment if the Risk/Reward binding cannot attach', () => {
  let lifecycle: { attach(series: unknown): void } | null = null;
  const markerBinding = { present: vi.fn(), close: vi.fn() };
  createAnalysisSavedTradeOverlayRendererSession({
    createRendererFactory(next) { lifecycle = next as never; return {} as never; },
    createMarkerBinding: vi.fn(() => markerBinding) as never,
    createRiskRewardBinding: vi.fn(() => { throw new Error('primitive unavailable'); }) as never,
  });
  expect(() => lifecycle!.attach({})).toThrow('primitive unavailable');
  expect(markerBinding.close).toHaveBeenCalledTimes(1);
});
