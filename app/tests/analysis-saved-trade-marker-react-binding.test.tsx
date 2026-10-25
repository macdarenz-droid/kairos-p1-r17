import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import type { JournalHistoryEntry } from '../src/application/journal';
import type { AnalysisCandleRendererFactory } from '../src/app/analysisCandleRendererSession';
import type { AnalysisSavedTradeChartReferenceScope } from '../src/app/analysisSavedTradeChartReferenceProjection';
import type { AnalysisSavedTradeMarkerPresentationResult } from '../src/app/analysisSavedTradeMarkerPresentationSession';
import type { AnalysisSavedTradeMarkerPresentationSession } from '../src/app/analysisSavedTradeMarkerPresentationSession';
import { useAnalysisSavedTradeMarkerPresentationSession } from '../src/app/useAnalysisSavedTradeMarkerPresentationSession';
import type { ChartTheme } from '../src/design-system/themes/chartThemeAdapter';
import type { MarketCandleHistorySnapshot } from '../src/services/market-data/MarketCandleHistoryPort';

const entry = {} as JournalHistoryEntry;
const nextEntry = { trade: { id: 'trade-2' } } as JournalHistoryEntry;
const scope = { instrument: { venue: 'binance-spot', symbol: 'ETHUSDT' }, quoteAsset: 'USDT' } as const;
const snapshot = {} as MarketCandleHistorySnapshot;
const theme = { drawingPrimary: '#111111', drawingSecondary: '#eeeeee' } as ChartTheme;
const nextTheme = { drawingPrimary: '#222222', drawingSecondary: '#dddddd' } as ChartTheme;
const rendererFactory = {} as AnalysisCandleRendererFactory;
const presentation = { presentation: { kind: 'pending-series' } } as AnalysisSavedTradeMarkerPresentationResult;
const nextPresentation = { presentation: { kind: 'presented' } } as AnalysisSavedTradeMarkerPresentationResult;

function harness() {
  const present = vi.fn(() => presentation);
  const close = vi.fn();
  const session: AnalysisSavedTradeMarkerPresentationSession = {
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
  snapshot: null as MarketCandleHistorySnapshot | null,
  theme,
  createSession,
});

it('mounts one released Gate443 session and exposes its exact renderer factory', () => {
  const h = harness();
  const { result } = renderHook(() => useAnalysisSavedTradeMarkerPresentationSession(options(h.createSession)));

  expect(h.createSession).toHaveBeenCalledTimes(1);
  expect(result.current.rendererFactory).toBe(rendererFactory);
  expect(result.current.presentation).toBeNull();
  expect(h.present).not.toHaveBeenCalled();
});

it('waits for and delegates the exact caller-authoritative snapshot', () => {
  const h = harness();
  const initial = options(h.createSession);
  const { result, rerender } = renderHook(({ currentSnapshot }) => useAnalysisSavedTradeMarkerPresentationSession({
    ...initial,
    snapshot: currentSnapshot,
  }), { initialProps: { currentSnapshot: null as MarketCandleHistorySnapshot | null } });

  rerender({ currentSnapshot: snapshot });

  expect(h.present).toHaveBeenCalledWith({ entry, scope, snapshot, theme });
  expect(result.current.presentation).toBe(presentation);
  expect(result.current.lastError).toBeNull();
});

it('reuses the same session for exact trade, scope, theme and caller-revision changes', () => {
  const h = harness();
  h.present.mockReturnValueOnce(presentation).mockReturnValue(nextPresentation);
  const initial = { ...options(h.createSession), snapshot };
  const { result, rerender } = renderHook(({ selectedEntry, selectedScope, selectedTheme, revision }) =>
    useAnalysisSavedTradeMarkerPresentationSession({
      ...initial,
      entry: selectedEntry,
      scope: selectedScope,
      theme: selectedTheme,
      revision,
    }), {
      initialProps: {
        selectedEntry: entry,
        selectedScope: scope as AnalysisSavedTradeChartReferenceScope,
        selectedTheme: theme,
        revision: 0,
      },
    });

  rerender({
    selectedEntry: nextEntry,
    selectedScope: { ...scope, instrument: { ...scope.instrument, symbol: 'BTCUSDT' } },
    selectedTheme: nextTheme,
    revision: 1,
  });

  expect(h.createSession).toHaveBeenCalledTimes(1);
  expect(h.present).toHaveBeenCalledTimes(2);
  expect(h.present).toHaveBeenLastCalledWith({
    entry: nextEntry,
    scope: { instrument: { venue: 'binance-spot', symbol: 'BTCUSDT' }, quoteAsset: 'USDT' },
    snapshot,
    theme: nextTheme,
  });
  expect(result.current.presentation).toBe(nextPresentation);
});

it('retains the last complete result when a released lower owner fails closed', () => {
  const h = harness();
  const error = new Error('analysis-saved-trade-execution-marker-id-duplicate');
  const initial = { ...options(h.createSession), snapshot };
  const { result, rerender } = renderHook(({ revision }) => useAnalysisSavedTradeMarkerPresentationSession({
    ...initial,
    revision,
  }), { initialProps: { revision: 0 } });

  h.present.mockImplementationOnce(() => { throw error; });
  rerender({ revision: 1 });

  expect(result.current.presentation).toBe(presentation);
  expect(result.current.lastError).toBe(error);
});

it('closes only its own released session once on unmount', () => {
  const h = harness();
  const { unmount } = renderHook(() => useAnalysisSavedTradeMarkerPresentationSession(options(h.createSession)));

  act(() => unmount());
  unmount();
  expect(h.close).toHaveBeenCalledTimes(1);
});

it('reports synchronous session construction failure without inventing a renderer', () => {
  const error = new Error('marker presentation construction failed');
  const createSession = vi.fn(() => { throw error; });
  const { result } = renderHook(() => useAnalysisSavedTradeMarkerPresentationSession({
    ...options(createSession as never),
    snapshot,
  }));

  expect(result.current.rendererFactory).toBeNull();
  expect(result.current.presentation).toBeNull();
  expect(result.current.lastError).toBe(error);
});
