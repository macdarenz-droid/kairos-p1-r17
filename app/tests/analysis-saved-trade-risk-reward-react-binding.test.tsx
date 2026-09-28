import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { JournalHistoryEntry } from '../src/application/journal';
import type { AnalysisCandleRendererFactory } from '../src/app/analysisCandleRendererSession';
import type { AnalysisSavedTradeChartReferenceScope } from '../src/app/analysisSavedTradeChartReferenceProjection';
import type { AnalysisSavedTradeRiskRewardCanvasStyleSource } from '../src/app/analysisSavedTradeRiskRewardCanvasPaneRenderer';
import type {
  AnalysisSavedTradeRiskRewardPresentationResult,
  AnalysisSavedTradeRiskRewardPresentationSession,
} from '../src/app/analysisSavedTradeRiskRewardPresentationSession';
import { useAnalysisSavedTradeRiskRewardPresentationSession } from '../src/app/useAnalysisSavedTradeRiskRewardPresentationSession';

const entry = {} as JournalHistoryEntry;
const nextEntry = { trade: { id: 'trade-2' } } as JournalHistoryEntry;
const scope = { instrument: { venue: 'binance-spot', symbol: 'ETHUSDT' }, quoteAsset: 'USDT' } as const;
const extent = { start: '2026-09-14T01:00:00.000Z', end: '2026-09-14T02:00:00.000Z' } as const;
const nextExtent = { start: '2026-09-14T02:00:00.000Z', end: '2026-09-14T03:00:00.000Z' } as const;
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
const presentation = { presentation: { kind: 'pending-series' } } as AnalysisSavedTradeRiskRewardPresentationResult;
const nextPresentation = { presentation: { kind: 'bound' } } as AnalysisSavedTradeRiskRewardPresentationResult;

function harness() {
  const present = vi.fn(() => presentation);
  const close = vi.fn();
  const session: AnalysisSavedTradeRiskRewardPresentationSession = {
    rendererFactory,
    present,
    presentation: vi.fn(() => null),
    close,
  };
  const createSession = vi.fn(() => session);
  return { session, present, close, createSession };
}

const options = (createSession: ReturnType<typeof harness>['createSession']) => ({
  entry,
  scope,
  extent,
  styleSource,
  createSession,
});

it('mounts one released Gate455 session and exposes its exact renderer factory', () => {
  const h = harness();
  const { result } = renderHook(() => useAnalysisSavedTradeRiskRewardPresentationSession(options(h.createSession)));

  expect(h.createSession).toHaveBeenCalledTimes(1);
  expect(h.present).toHaveBeenCalledWith({ entry, scope, extent, styleSource });
  expect(result.current.rendererFactory).toBe(rendererFactory);
  expect(result.current.presentation).toBe(presentation);
});

it('delegates exact caller-owned saved-trade, scope, extent and style evidence', () => {
  const h = harness();
  const { result } = renderHook(() => useAnalysisSavedTradeRiskRewardPresentationSession(options(h.createSession)));

  expect(h.present).toHaveBeenCalledWith({ entry, scope, extent, styleSource });
  expect(result.current.presentation).toBe(presentation);
  expect(result.current.lastError).toBeNull();
});

it('reuses the same session for exact evidence and caller-revision changes', () => {
  const h = harness();
  h.present.mockReturnValueOnce(presentation).mockReturnValue(nextPresentation);
  const initial = options(h.createSession);
  type Props = {
    selectedEntry: JournalHistoryEntry;
    selectedScope: AnalysisSavedTradeChartReferenceScope;
    selectedExtent: AnalysisSavedTradeRiskRewardPresentationSession['present'] extends
      (input: infer Input) => unknown
      ? Input extends { readonly extent: infer Extent } ? Extent : never
      : never;
    selectedStyle: AnalysisSavedTradeRiskRewardCanvasStyleSource;
    revision: number;
  };
  const initialProps: Props = {
    selectedEntry: entry,
    selectedScope: scope,
    selectedExtent: extent,
    selectedStyle: styleSource,
    revision: 0,
  };
  const { result, rerender } = renderHook((props: Props) => useAnalysisSavedTradeRiskRewardPresentationSession({
    ...initial,
    entry: props.selectedEntry,
    scope: props.selectedScope,
    extent: props.selectedExtent,
    styleSource: props.selectedStyle,
    revision: props.revision,
  }), { initialProps });

  rerender({
    selectedEntry: nextEntry,
    selectedScope: { ...scope, instrument: { ...scope.instrument, symbol: 'BTCUSDT' } },
    selectedExtent: nextExtent,
    selectedStyle: nextStyleSource,
    revision: 1,
  });

  expect(h.createSession).toHaveBeenCalledTimes(1);
  expect(h.present).toHaveBeenCalledTimes(2);
  expect(h.present).toHaveBeenLastCalledWith({
    entry: nextEntry,
    scope: { instrument: { venue: 'binance-spot', symbol: 'BTCUSDT' }, quoteAsset: 'USDT' },
    extent: nextExtent,
    styleSource: nextStyleSource,
  });
  expect(result.current.presentation).toBe(nextPresentation);
});

it('retains the last complete result when a released lower owner fails closed', () => {
  const h = harness();
  const error = new Error('risk-reward-renderer-evidence-ambiguous');
  const initial = options(h.createSession);
  const { result, rerender } = renderHook(({ revision }) =>
    useAnalysisSavedTradeRiskRewardPresentationSession({ ...initial, revision }),
  { initialProps: { revision: 0 } });

  h.present.mockImplementationOnce(() => { throw error; });
  rerender({ revision: 1 });

  expect(result.current.presentation).toBe(presentation);
  expect(result.current.lastError).toBe(error);
});

it('closes only its own released session once on unmount', () => {
  const h = harness();
  const { unmount } = renderHook(() => useAnalysisSavedTradeRiskRewardPresentationSession(options(h.createSession)));

  act(() => unmount());
  unmount();
  expect(h.close).toHaveBeenCalledTimes(1);
});

it('reports synchronous session construction failure without inventing a renderer', () => {
  const error = new Error('Risk/Reward presentation construction failed');
  const createSession = vi.fn(() => { throw error; });
  const { result } = renderHook(() => useAnalysisSavedTradeRiskRewardPresentationSession({
    ...options(createSession as never),
  }));

  expect(result.current.rendererFactory).toBeNull();
  expect(result.current.presentation).toBeNull();
  expect(result.current.lastError).toBe(error);
});
