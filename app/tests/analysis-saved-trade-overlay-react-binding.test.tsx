import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { JournalHistoryEntry } from '../src/application/journal';
import type { AnalysisCandleRendererFactory } from '../src/app/analysisCandleRendererSession';
import type { AnalysisSavedTradeChartReferenceScope } from '../src/app/analysisSavedTradeChartReferenceProjection';
import type { AnalysisSavedTradeMarkerPresentationResult } from '../src/app/analysisSavedTradeMarkerPresentationSession';
import type {
  AnalysisSavedTradeOverlayPresentation,
  AnalysisSavedTradeOverlayPresentationSession,
} from '../src/app/analysisSavedTradeOverlayPresentationSession';
import type { AnalysisSavedTradeRiskRewardCanvasStyleSource } from '../src/app/analysisSavedTradeRiskRewardCanvasPaneRenderer';
import type { AnalysisSavedTradeRiskRewardPresentationResult } from '../src/app/analysisSavedTradeRiskRewardPresentationSession';
import {
  useAnalysisSavedTradeOverlayPresentationSession,
  type AnalysisSavedTradeOverlayReactBindingOptions,
} from '../src/app/useAnalysisSavedTradeOverlayPresentationSession';
import type { ChartTheme } from '../src/design-system/themes/chartThemeAdapter';
import type { MarketCandleHistorySnapshot } from '../src/services/market-data/MarketCandleHistoryPort';

const entry = {} as JournalHistoryEntry;
const nextEntry = { trade: { id: 'trade-2' } } as JournalHistoryEntry;
const scope = { instrument: { venue: 'binance-spot', symbol: 'ETHUSDT' }, quoteAsset: 'USDT' } as const;
const snapshot = {} as MarketCandleHistorySnapshot;
const theme = { drawingPrimary: '#111111', drawingSecondary: '#eeeeee' } as ChartTheme;
const nextTheme = { drawingPrimary: '#222222', drawingSecondary: '#dddddd' } as ChartTheme;
const extent = { start: '2026-09-15T01:00:00.000Z', end: '2026-09-15T02:00:00.000Z' } as const;
const nextExtent = { start: '2026-09-15T02:00:00.000Z', end: '2026-09-15T03:00:00.000Z' } as const;
const styleSource = Object.freeze({
  lineWidth: 2,
  zoneOpacity: 0.2,
  resolveToken: vi.fn((token: string) => token),
}) satisfies AnalysisSavedTradeRiskRewardCanvasStyleSource;
const nextStyleSource = Object.freeze({
  lineWidth: 3,
  zoneOpacity: 0.3,
  resolveToken: vi.fn((token: string) => token),
}) satisfies AnalysisSavedTradeRiskRewardCanvasStyleSource;
const rendererFactory = {} as AnalysisCandleRendererFactory;
const markerPresentation = { presentation: { kind: 'pending-series' } } as AnalysisSavedTradeMarkerPresentationResult;
const nextMarkerPresentation = { presentation: { kind: 'presented' } } as AnalysisSavedTradeMarkerPresentationResult;
const riskRewardPresentation = { presentation: { kind: 'pending-series' } } as AnalysisSavedTradeRiskRewardPresentationResult;
const nextRiskRewardPresentation = { presentation: { kind: 'bound' } } as AnalysisSavedTradeRiskRewardPresentationResult;

function harness() {
  let markers: AnalysisSavedTradeMarkerPresentationResult | null = null;
  let riskReward: AnalysisSavedTradeRiskRewardPresentationResult | null = null;
  let markerValue = markerPresentation;
  let riskRewardValue = riskRewardPresentation;
  const renderer = Object.freeze({ markers: null, riskReward: null }) as AnalysisSavedTradeOverlayPresentation['renderer'];
  const presentMarkers = vi.fn(() => {
    markers = markerValue;
    return markerValue;
  });
  const presentRiskReward = vi.fn(() => {
    riskReward = riskRewardValue;
    return riskRewardValue;
  });
  const presentation = vi.fn(() => Object.freeze({ markers, riskReward, renderer }));
  const close = vi.fn();
  const session: AnalysisSavedTradeOverlayPresentationSession = {
    rendererFactory,
    presentMarkers,
    presentRiskReward,
    presentation,
    close,
  };
  const createSession = vi.fn(() => session);
  return {
    createSession,
    close,
    presentMarkers,
    presentRiskReward,
    presentation,
    setMarkerValue(value: AnalysisSavedTradeMarkerPresentationResult) { markerValue = value; },
    setRiskRewardValue(value: AnalysisSavedTradeRiskRewardPresentationResult) { riskRewardValue = value; },
  };
}

const options = (createSession: ReturnType<typeof harness>['createSession']) => ({
  entry,
  scope,
  snapshot: null as MarketCandleHistorySnapshot | null,
  theme,
  extent,
  styleSource,
  createSession,
});

it('mounts one released Gate459 session and exposes its exact shared renderer factory', () => {
  const h = harness();
  const { result } = renderHook(() => useAnalysisSavedTradeOverlayPresentationSession(options(h.createSession)));

  expect(h.createSession).toHaveBeenCalledTimes(1);
  expect(result.current.rendererFactory).toBe(rendererFactory);
  expect(h.presentMarkers).not.toHaveBeenCalled();
  expect(h.presentRiskReward).toHaveBeenCalledWith({ entry, scope, extent, styleSource });
  expect(result.current.presentation?.riskReward).toBe(riskRewardPresentation);
});

it('keeps the shared renderer available while deferring Risk/Reward until exact extent exists', () => {
  const h = harness();
  const initial = { ...options(h.createSession), extent: null };
  const { result, rerender } = renderHook(({ selectedExtent }) =>
    useAnalysisSavedTradeOverlayPresentationSession({ ...initial, extent: selectedExtent }),
  { initialProps: {
    selectedExtent: null as AnalysisSavedTradeOverlayReactBindingOptions['extent'],
  } });

  expect(result.current.rendererFactory).toBe(rendererFactory);
  expect(h.presentRiskReward).not.toHaveBeenCalled();

  rerender({ selectedExtent: extent });
  expect(h.presentRiskReward).toHaveBeenCalledWith({ entry, scope, extent, styleSource });
  expect(result.current.presentation?.riskReward).toBe(riskRewardPresentation);
});

it('waits for exact authoritative history before delegating marker evidence', () => {
  const h = harness();
  const initial = options(h.createSession);
  const { result, rerender } = renderHook(({ currentSnapshot }) =>
    useAnalysisSavedTradeOverlayPresentationSession({ ...initial, snapshot: currentSnapshot }),
  { initialProps: { currentSnapshot: null as MarketCandleHistorySnapshot | null } });

  rerender({ currentSnapshot: snapshot });

  expect(h.presentMarkers).toHaveBeenCalledWith({ entry, scope, snapshot, theme });
  expect(result.current.presentation?.markers).toBe(markerPresentation);
  expect(result.current.presentation?.riskReward).toBe(riskRewardPresentation);
  expect(result.current.markerError).toBeNull();
});

it('reuses one shared session across exact marker and Risk/Reward input changes', () => {
  const h = harness();
  h.setMarkerValue(nextMarkerPresentation);
  h.setRiskRewardValue(nextRiskRewardPresentation);
  const initial = { ...options(h.createSession), snapshot };
  type Props = {
    selectedEntry: JournalHistoryEntry;
    selectedScope: AnalysisSavedTradeChartReferenceScope;
    selectedTheme: ChartTheme;
    selectedExtent: AnalysisSavedTradeOverlayReactBindingOptions['extent'];
    selectedStyle: AnalysisSavedTradeRiskRewardCanvasStyleSource;
    revision: number;
  };
  const { result, rerender } = renderHook((props: Props) => useAnalysisSavedTradeOverlayPresentationSession({
    ...initial,
    entry: props.selectedEntry,
    scope: props.selectedScope,
    theme: props.selectedTheme,
    extent: props.selectedExtent,
    styleSource: props.selectedStyle,
    revision: props.revision,
  }), {
    initialProps: {
      selectedEntry: entry,
      selectedScope: scope as AnalysisSavedTradeChartReferenceScope,
      selectedTheme: theme,
      selectedExtent: extent,
      selectedStyle: styleSource,
      revision: 0,
    } as Props,
  });

  const nextScope = { instrument: { venue: 'binance-spot', symbol: 'BTCUSDT' }, quoteAsset: 'USDT' } as const;
  rerender({
    selectedEntry: nextEntry,
    selectedScope: nextScope,
    selectedTheme: nextTheme,
    selectedExtent: nextExtent,
    selectedStyle: nextStyleSource,
    revision: 1,
  });

  expect(h.createSession).toHaveBeenCalledTimes(1);
  expect(h.presentMarkers).toHaveBeenLastCalledWith({ entry: nextEntry, scope: nextScope, snapshot, theme: nextTheme });
  expect(h.presentRiskReward).toHaveBeenLastCalledWith({
    entry: nextEntry,
    scope: nextScope,
    extent: nextExtent,
    styleSource: nextStyleSource,
  });
  expect(result.current.presentation?.markers).toBe(nextMarkerPresentation);
  expect(result.current.presentation?.riskReward).toBe(nextRiskRewardPresentation);
});

it('preserves both last complete results when the marker owner rejects ambiguity', () => {
  const h = harness();
  const error = new Error('marker-evidence-ambiguous');
  const initial = { ...options(h.createSession), snapshot };
  const { result, rerender } = renderHook(({ revision }) =>
    useAnalysisSavedTradeOverlayPresentationSession({ ...initial, revision }),
  { initialProps: { revision: 0 } });

  h.presentMarkers.mockImplementationOnce(() => { throw error; });
  rerender({ revision: 1 });

  expect(result.current.presentation?.markers).toBe(markerPresentation);
  expect(result.current.presentation?.riskReward).toBe(riskRewardPresentation);
  expect(result.current.markerError).toBe(error);
  expect(result.current.riskRewardError).toBeNull();
});

it('preserves both last complete results when the Risk/Reward owner rejects ambiguity', () => {
  const h = harness();
  const error = new Error('risk-reward-evidence-ambiguous');
  const initial = { ...options(h.createSession), snapshot };
  const { result, rerender } = renderHook(({ revision }) =>
    useAnalysisSavedTradeOverlayPresentationSession({ ...initial, revision }),
  { initialProps: { revision: 0 } });

  h.presentRiskReward.mockImplementationOnce(() => { throw error; });
  rerender({ revision: 1 });

  expect(result.current.presentation?.markers).toBe(markerPresentation);
  expect(result.current.presentation?.riskReward).toBe(riskRewardPresentation);
  expect(result.current.markerError).toBeNull();
  expect(result.current.riskRewardError).toBe(error);
});

it('closes only its own shared session once on unmount', () => {
  const h = harness();
  const { unmount } = renderHook(() => useAnalysisSavedTradeOverlayPresentationSession(options(h.createSession)));

  act(() => unmount());
  unmount();
  expect(h.close).toHaveBeenCalledTimes(1);
});

it('reports construction failure without inventing a renderer or presentation', () => {
  const error = new Error('overlay presentation construction failed');
  const createSession = vi.fn(() => { throw error; });
  const { result } = renderHook(() => useAnalysisSavedTradeOverlayPresentationSession({
    ...options(createSession as never),
    snapshot,
  }));

  expect(result.current.rendererFactory).toBeNull();
  expect(result.current.presentation).toBeNull();
  expect(result.current.markerError).toBe(error);
  expect(result.current.riskRewardError).toBe(error);
});
