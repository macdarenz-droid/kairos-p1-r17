import { describe, expect, it, vi } from 'vitest';
import type { JournalHistoryEntry } from '../src/application/journal';
import type { ChartTheme } from '../src/design-system/themes/chartThemeAdapter';
import type { MarketCandleHistorySnapshot } from '../src/services/market-data/MarketCandleHistoryPort';
import type { AnalysisCandleRendererFactory } from '../src/app/analysisCandleRendererSession';
import type { AnalysisSavedTradeCandleWindowProjection } from '../src/app/analysisSavedTradeCandleWindowProjection';
import type { AnalysisSavedTradeChartReferenceProjection } from '../src/app/analysisSavedTradeChartReferenceProjection';
import type { AnalysisSavedTradeExecutionMarkerProjection } from '../src/app/analysisSavedTradeExecutionMarkerProjection';
import { createAnalysisSavedTradeMarkerPresentationSession } from '../src/app/analysisSavedTradeMarkerPresentationSession';
import type { AnalysisSavedTradeOverlayRendererSession } from '../src/app/analysisSavedTradeOverlayRendererSession';
import { createAnalysisSavedTradeOverlayPresentationSession } from '../src/app/analysisSavedTradeOverlayPresentationSession';
import type { AnalysisSavedTradeRiskRewardCanvasStyleSource } from '../src/app/analysisSavedTradeRiskRewardCanvasPaneRenderer';
import type { AnalysisSavedTradeRiskRewardReferenceProjection } from '../src/app/analysisSavedTradeRiskRewardReferenceProjection';
import type { AnalysisSavedTradeRiskRewardRendererProjection } from '../src/app/analysisSavedTradeRiskRewardRendererProjection';
import { createAnalysisSavedTradeRiskRewardPresentationSession } from '../src/app/analysisSavedTradeRiskRewardPresentationSession';

const rendererFactory = {} as AnalysisCandleRendererFactory;
const entry = {} as JournalHistoryEntry;
const scope = { instrument: { venue: 'binance-spot', symbol: 'ETHUSDT' }, quoteAsset: 'USDT' } as const;
const snapshot = {} as MarketCandleHistorySnapshot;
const theme = { drawingPrimary: '#111', drawingSecondary: '#eee' } as ChartTheme;
const extent = { start: '2026-09-15T00:00:00.000Z', end: '2026-09-15T01:00:00.000Z' } as const;
const styleSource = Object.freeze({
  lineWidth: 2,
  zoneOpacity: 0.2,
  resolveToken: vi.fn((token: string) => token),
}) satisfies AnalysisSavedTradeRiskRewardCanvasStyleSource;
const reference = { kind: 'reference-ready' } as AnalysisSavedTradeChartReferenceProjection;
const window = { kind: 'window-ready' } as AnalysisSavedTradeCandleWindowProjection;
const markers = Object.freeze({
  kind: 'markers-ready' as const,
  historyObservedAt: '2026-09-15T00:00:00.000Z',
  historyInterval: '1m',
  markers: Object.freeze([]),
  unplacedExecutions: Object.freeze([]),
}) satisfies AnalysisSavedTradeExecutionMarkerProjection;
const logical = { kind: 'risk-reward-ready' } as AnalysisSavedTradeRiskRewardReferenceProjection;
const renderer = { kind: 'renderer-ready' } as AnalysisSavedTradeRiskRewardRendererProjection;
const markerRendered = Object.freeze({ kind: 'presented' as const, markerCount: 0, unplacedExecutions: Object.freeze([]) });
const riskRewardRendered = Object.freeze({ kind: 'bound' }) as never;

function harness() {
  let markerPresentation: unknown = null;
  let riskRewardPresentation: unknown = null;
  const presentMarkers = vi.fn(() => {
    markerPresentation = markerRendered;
    return markerRendered;
  });
  const presentRiskReward = vi.fn((projection: AnalysisSavedTradeRiskRewardRendererProjection) => {
    riskRewardPresentation = projection.kind === 'unavailable' ? projection : riskRewardRendered;
    return riskRewardPresentation as never;
  });
  const close = vi.fn();
  const overlayRenderer: AnalysisSavedTradeOverlayRendererSession = {
    rendererFactory,
    presentMarkers,
    presentRiskReward,
    presentation: vi.fn(() => ({ markers: markerPresentation as never, riskReward: riskRewardPresentation as never })),
    close,
  };
  const projectMarkers = vi.fn(() => markers);
  const projectRiskReward = vi.fn(() => renderer);
  const createMarkerSession = vi.fn((dependencies = {}) => createAnalysisSavedTradeMarkerPresentationSession({
    ...dependencies,
    projectReference: vi.fn(() => reference),
    projectWindow: vi.fn(() => window),
    projectMarkers,
  }));
  const createRiskRewardSession = vi.fn((dependencies = {}) => createAnalysisSavedTradeRiskRewardPresentationSession({
    ...dependencies,
    projectReference: vi.fn(() => reference),
    projectLogical: vi.fn(() => logical),
    projectRenderer: projectRiskReward,
  }));
  const session = createAnalysisSavedTradeOverlayPresentationSession({
    createOverlayRendererSession: () => overlayRenderer,
    createMarkerSession,
    createRiskRewardSession,
  });
  return { session, overlayRenderer, presentMarkers, presentRiskReward, close, projectMarkers, projectRiskReward };
}

describe('Analysis saved-trade overlay presentation session', () => {
  it('delegates released marker and Risk/Reward application owners into one exact renderer factory', () => {
    const h = harness();
    const markerResult = h.session.presentMarkers({ entry, scope, snapshot, theme });
    const riskRewardResult = h.session.presentRiskReward({ entry, scope, extent, styleSource });

    expect(h.session.rendererFactory).toBe(rendererFactory);
    expect(h.presentMarkers).toHaveBeenCalledWith(markers, theme);
    expect(h.presentRiskReward).toHaveBeenCalledWith(renderer, styleSource);
    expect(markerResult.presentation).toBe(markerRendered);
    expect(riskRewardResult.presentation).toBe(riskRewardRendered);
    expect(h.session.presentation()).toEqual({
      markers: markerResult,
      riskReward: riskRewardResult,
      renderer: { markers: markerRendered, riskReward: riskRewardRendered },
    });
    expect(Object.isFrozen(h.session.presentation())).toBe(true);
  });

  it('retains independent exact completed results when either lower projection rejects ambiguity', () => {
    const h = harness();
    const markerResult = h.session.presentMarkers({ entry, scope, snapshot, theme });
    const riskRewardResult = h.session.presentRiskReward({ entry, scope, extent, styleSource });
    h.projectMarkers.mockImplementationOnce(() => { throw new Error('marker-ambiguous'); });
    expect(() => h.session.presentMarkers({ entry, scope, snapshot, theme })).toThrow('marker-ambiguous');
    expect(h.session.presentation().markers).toBe(markerResult);
    expect(h.session.presentation().riskReward).toBe(riskRewardResult);
    h.projectRiskReward.mockImplementationOnce(() => { throw new Error('risk-reward-ambiguous'); });
    expect(() => h.session.presentRiskReward({ entry, scope, extent, styleSource })).toThrow('risk-reward-ambiguous');
    expect(h.session.presentation().markers).toBe(markerResult);
    expect(h.session.presentation().riskReward).toBe(riskRewardResult);
  });

  it('propagates exact unavailable Risk/Reward evidence through the shared renderer', () => {
    const h = harness();
    const unavailable = Object.freeze({ kind: 'unavailable' as const, reason: 'planned-stop-missing' as const });
    h.projectRiskReward.mockReturnValueOnce(unavailable);
    const result = h.session.presentRiskReward({ entry, scope, extent, styleSource });
    expect(result.renderer).toBe(unavailable);
    expect(result.presentation).toBe(unavailable);
    expect(h.presentRiskReward).toHaveBeenCalledWith(unavailable, styleSource);
  });

  it('fails closed and rolls back if a lower owner exposes a different renderer factory', () => {
    const closeMarker = vi.fn();
    const closeOverlay = vi.fn();
    expect(() => createAnalysisSavedTradeOverlayPresentationSession({
      createOverlayRendererSession: () => ({
        rendererFactory,
        presentMarkers: vi.fn(),
        presentRiskReward: vi.fn(),
        presentation: vi.fn(() => ({ markers: null, riskReward: null })),
        close: closeOverlay,
      }),
      createMarkerSession: () => ({
        rendererFactory: {} as AnalysisCandleRendererFactory,
        present: vi.fn(),
        presentation: vi.fn(() => null),
        close: closeMarker,
      }),
    })).toThrow('marker-renderer-factory-mismatch');
    expect(closeMarker).toHaveBeenCalledOnce();
    expect(closeOverlay).toHaveBeenCalledOnce();
  });

  it('closes lower application owners before the shared renderer exactly once', () => {
    const order: string[] = [];
    const overlayRenderer: AnalysisSavedTradeOverlayRendererSession = {
      rendererFactory,
      presentMarkers: vi.fn(),
      presentRiskReward: vi.fn(),
      presentation: vi.fn(() => ({ markers: null, riskReward: null })),
      close: vi.fn(() => order.push('renderer')),
    };
    const makeSession = (name: string) => ({
      rendererFactory,
      present: vi.fn(),
      presentation: vi.fn(() => null),
      close: vi.fn(() => order.push(name)),
    });
    const markerSession = makeSession('markers');
    const riskRewardSession = makeSession('risk-reward');
    const session = createAnalysisSavedTradeOverlayPresentationSession({
      createOverlayRendererSession: () => overlayRenderer,
      createMarkerSession: () => markerSession as never,
      createRiskRewardSession: () => riskRewardSession as never,
    });
    session.close();
    session.close();
    expect(order).toEqual(['risk-reward', 'markers', 'renderer']);
    expect(session.presentation()).toEqual({ markers: null, riskReward: null, renderer: { markers: null, riskReward: null } });
    expect(() => session.presentMarkers({ entry, scope, snapshot, theme })).toThrow('session-closed');
  });
});
