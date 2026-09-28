import { describe, expect, it, vi } from 'vitest';
import type { JournalHistoryEntry } from '../src/application/journal';
import type { ChartTheme } from '../src/design-system/themes/chartThemeAdapter';
import type { AnalysisCandleRendererFactory } from '../src/app/analysisCandleRendererSession';
import type { AnalysisSavedTradeCandleWindowProjection } from '../src/app/analysisSavedTradeCandleWindowProjection';
import type { AnalysisSavedTradeChartReferenceProjection } from '../src/app/analysisSavedTradeChartReferenceProjection';
import type { AnalysisSavedTradeExecutionMarkerProjection } from '../src/app/analysisSavedTradeExecutionMarkerProjection';
import { createAnalysisSavedTradeMarkerPresentationSession } from '../src/app/analysisSavedTradeMarkerPresentationSession';
import type { AnalysisSavedTradeRendererMarkerSession } from '../src/app/analysisSavedTradeRendererMarkerSession';
import type { MarketCandleHistorySnapshot } from '../src/services/market-data/MarketCandleHistoryPort';

const entry = {} as JournalHistoryEntry;
const scope = { instrument: { venue: 'binance-spot', symbol: 'ETHUSDT' }, quoteAsset: 'USDT' } as const;
const snapshot = {} as MarketCandleHistorySnapshot;
const theme = { drawingPrimary: '#111111', drawingSecondary: '#eeeeee' } as ChartTheme;
const reference = { kind: 'reference-ready' } as AnalysisSavedTradeChartReferenceProjection;
const window = { kind: 'window-ready' } as AnalysisSavedTradeCandleWindowProjection;
const markers: AnalysisSavedTradeExecutionMarkerProjection = {
  kind: 'markers-ready', historyObservedAt: '2026-09-14T01:00:00.000Z', historyInterval: '1m',
  markers: [], unplacedExecutions: [],
};
const rendererFactory = {} as AnalysisCandleRendererFactory;

function harness(presentation: AnalysisSavedTradeRendererMarkerSession['present'] = () => ({
  kind: 'presented', markerCount: 0, unplacedExecutions: [],
})) {
  const present = vi.fn(presentation);
  const close = vi.fn();
  const rendererMarkerSession: AnalysisSavedTradeRendererMarkerSession = {
    rendererFactory, present, presentation: vi.fn(() => null), close,
  };
  const projectReference = vi.fn(() => reference);
  const projectWindow = vi.fn(() => window);
  const projectMarkers = vi.fn(() => markers);
  const session = createAnalysisSavedTradeMarkerPresentationSession({
    createRendererMarkerSession: () => rendererMarkerSession,
    projectReference,
    projectWindow,
    projectMarkers,
  });
  return { session, present, close, projectReference, projectWindow, projectMarkers };
}

describe('Analysis saved-trade marker presentation session', () => {
  it('delegates exact caller and authoritative snapshot evidence through the released projection chain', () => {
    const { session, present, projectReference, projectWindow, projectMarkers } = harness();
    const result = session.present({ entry, scope, snapshot, theme });

    expect(session.rendererFactory).toBe(rendererFactory);
    expect(projectReference).toHaveBeenCalledWith(entry, scope);
    expect(projectWindow).toHaveBeenCalledWith(reference, snapshot);
    expect(projectMarkers).toHaveBeenCalledWith(window);
    expect(present).toHaveBeenCalledWith(markers, theme);
    expect(result).toEqual({
      reference, window, markers,
      presentation: { kind: 'presented', markerCount: 0, unplacedExecutions: [] },
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(session.presentation()).toBe(result);
  });

  it('preserves unavailable and unplaced evidence instead of manufacturing a marker', () => {
    const unavailable: AnalysisSavedTradeExecutionMarkerProjection = {
      kind: 'unavailable', reason: 'history-scope-mismatch',
    };
    const unplaced = Object.freeze([{
      executionId: 'exit-gap', role: 'exit' as const, executedAt: '2026-09-14T01:01:30.000Z',
      price: '110.25' as never, quantity: '1' as never, reason: 'not-covered' as const,
    }]);
    const readyWithUnplaced: AnalysisSavedTradeExecutionMarkerProjection = {
      ...markers, unplacedExecutions: unplaced,
    };
    const markerProjector = vi.fn()
      .mockReturnValueOnce(unavailable)
      .mockReturnValueOnce(readyWithUnplaced);
    const present = vi.fn()
      .mockReturnValueOnce({ kind: 'unavailable', reason: 'history-scope-mismatch' })
      .mockReturnValueOnce({ kind: 'presented', markerCount: 0, unplacedExecutions: unplaced });
    const rendererMarkerSession = { rendererFactory, present, presentation: vi.fn(() => null), close: vi.fn() };
    const session = createAnalysisSavedTradeMarkerPresentationSession({
      createRendererMarkerSession: () => rendererMarkerSession,
      projectReference: () => reference,
      projectWindow: () => window,
      projectMarkers: markerProjector,
    });

    expect(session.present({ entry, scope, snapshot, theme }).markers).toBe(unavailable);
    const second = session.present({ entry, scope, snapshot, theme });
    expect(second.markers).toBe(readyWithUnplaced);
    expect(second.presentation).toEqual({ kind: 'presented', markerCount: 0, unplacedExecutions: unplaced });
  });

  it('does not replace the current successful result when a lower owner fails closed', () => {
    const { session, projectMarkers } = harness();
    const first = session.present({ entry, scope, snapshot, theme });
    projectMarkers.mockImplementationOnce(() => {
      throw new Error('analysis-saved-trade-execution-marker-id-duplicate');
    });

    expect(() => session.present({ entry, scope, snapshot, theme })).toThrow(
      'analysis-saved-trade-execution-marker-id-duplicate',
    );
    expect(session.presentation()).toBe(first);
  });

  it('closes the renderer-marker owner once, clears evidence and rejects later presentation', () => {
    const { session, close } = harness();
    session.present({ entry, scope, snapshot, theme });
    session.close();
    session.close();

    expect(close).toHaveBeenCalledOnce();
    expect(session.presentation()).toBeNull();
    expect(() => session.present({ entry, scope, snapshot, theme })).toThrow(
      'analysis-saved-trade-marker-presentation-session-closed',
    );
  });
});
